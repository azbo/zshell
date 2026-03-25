package session

import (
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"golang.org/x/crypto/ssh"

	"zshell/internal/models"
	"zshell/internal/storage"
)

type sshEnvelope struct {
	Type     string `json:"type"`
	HostID   string `json:"hostId,omitempty"`
	Password string `json:"password,omitempty"`
	Data     string `json:"data,omitempty"`
	Cols     int    `json:"cols,omitempty"`
	Rows     int    `json:"rows,omitempty"`
	Message  string `json:"message,omitempty"`
}

type SSHHandler struct {
	store    *storage.HostStore
	upgrader websocket.Upgrader
}

func NewSSHHandler(store *storage.HostStore) *SSHHandler {
	return &SSHHandler{
		store: store,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
	}
}

func (h *SSHHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	var initMsg sshEnvelope
	if err := conn.ReadJSON(&initMsg); err != nil {
		writeEnvelope(conn, sshEnvelope{Type: "error", Message: "failed to read connect payload"})
		return
	}
	if initMsg.Type != "connect" || initMsg.HostID == "" {
		writeEnvelope(conn, sshEnvelope{Type: "error", Message: "invalid connect payload"})
		return
	}

	host, ok, err := h.store.Get(initMsg.HostID)
	if err != nil {
		writeEnvelope(conn, sshEnvelope{Type: "error", Message: err.Error()})
		return
	}
	if !ok {
		writeEnvelope(conn, sshEnvelope{Type: "error", Message: storage.ErrHostNotFound.Error()})
		return
	}

	writeEnvelope(conn, sshEnvelope{Type: "status", Message: "connecting"})

	client, sshSession, stdin, err := connect(host, initMsg.Password, initMsg.Cols, initMsg.Rows)
	if err != nil {
		writeEnvelope(conn, sshEnvelope{Type: "error", Message: err.Error()})
		return
	}
	defer client.Close()
	defer sshSession.Close()

	writeEnvelope(conn, sshEnvelope{Type: "connected", Message: "connected"})

	var writeMu sync.Mutex
	streamToClient := func(reader io.Reader) {
		buffer := make([]byte, 4096)
		for {
			count, readErr := reader.Read(buffer)
			if count > 0 {
				writeMu.Lock()
				_ = conn.WriteJSON(sshEnvelope{
					Type: "output",
					Data: string(buffer[:count]),
				})
				writeMu.Unlock()
			}
			if readErr != nil {
				if !errors.Is(readErr, io.EOF) {
					writeMu.Lock()
					_ = conn.WriteJSON(sshEnvelope{Type: "error", Message: readErr.Error()})
					writeMu.Unlock()
				}
				return
			}
		}
	}

	go streamToClient(sshSession.stdout)
	go streamToClient(sshSession.stderr)

	waitDone := make(chan struct{})
	go func() {
		defer close(waitDone)
		_ = sshSession.session.Wait()
		writeMu.Lock()
		_ = conn.WriteJSON(sshEnvelope{Type: "closed", Message: "remote session closed"})
		writeMu.Unlock()
	}()

	for {
		var msg sshEnvelope
		if err := conn.ReadJSON(&msg); err != nil {
			return
		}
		switch msg.Type {
		case "input":
			if _, err := io.WriteString(stdin, msg.Data); err != nil {
				writeEnvelope(conn, sshEnvelope{Type: "error", Message: err.Error()})
				return
			}
		case "resize":
			if msg.Cols > 0 && msg.Rows > 0 {
				if err := sshSession.session.WindowChange(msg.Rows, msg.Cols); err != nil {
					writeEnvelope(conn, sshEnvelope{Type: "error", Message: err.Error()})
				}
			}
		case "ping":
			writeEnvelope(conn, sshEnvelope{Type: "pong"})
		case "close":
			return
		}

		select {
		case <-waitDone:
			return
		default:
		}
	}
}

type activeSession struct {
	session *ssh.Session
	stdout  io.Reader
	stderr  io.Reader
}

func (s *activeSession) Close() error {
	return s.session.Close()
}

func connect(host models.Host, password string, cols, rows int) (*ssh.Client, *activeSession, io.WriteCloser, error) {
	config, err := buildClientConfig(host, password)
	if err != nil {
		return nil, nil, nil, err
	}

	address := net.JoinHostPort(host.Address, fmt.Sprintf("%d", host.Port))
	client, err := ssh.Dial("tcp", address, config)
	if err != nil {
		return nil, nil, nil, err
	}

	session, err := client.NewSession()
	if err != nil {
		client.Close()
		return nil, nil, nil, err
	}

	stdin, err := session.StdinPipe()
	if err != nil {
		session.Close()
		client.Close()
		return nil, nil, nil, err
	}
	stdout, err := session.StdoutPipe()
	if err != nil {
		session.Close()
		client.Close()
		return nil, nil, nil, err
	}
	stderr, err := session.StderrPipe()
	if err != nil {
		session.Close()
		client.Close()
		return nil, nil, nil, err
	}

	if rows <= 0 {
		rows = 30
	}
	if cols <= 0 {
		cols = 120
	}

	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}
	if err := session.RequestPty("xterm-256color", rows, cols, modes); err != nil {
		session.Close()
		client.Close()
		return nil, nil, nil, err
	}

	if host.DefaultShell != "" {
		if err := session.Start(host.DefaultShell); err != nil {
			session.Close()
			client.Close()
			return nil, nil, nil, err
		}
	} else if err := session.Shell(); err != nil {
		session.Close()
		client.Close()
		return nil, nil, nil, err
	}

	return client, &activeSession{
		session: session,
		stdout:  stdout,
		stderr:  stderr,
	}, stdin, nil
}

func buildClientConfig(host models.Host, password string) (*ssh.ClientConfig, error) {
	authMethod, err := authMethodForHost(host, password)
	if err != nil {
		return nil, err
	}

	return &ssh.ClientConfig{
		User:            host.Username,
		Auth:            []ssh.AuthMethod{authMethod},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         10 * time.Second,
	}, nil
}

func authMethodForHost(host models.Host, password string) (ssh.AuthMethod, error) {
	switch host.AuthType {
	case models.AuthPassword:
		if password == "" {
			return nil, errors.New("password is required")
		}
		return ssh.Password(password), nil
	case models.AuthKey:
		keyBytes, err := os.ReadFile(host.KeyPath)
		if err != nil {
			return nil, err
		}
		signer, err := ssh.ParsePrivateKey(keyBytes)
		if err != nil {
			return nil, err
		}
		return ssh.PublicKeys(signer), nil
	default:
		return nil, fmt.Errorf("unsupported auth type %q", host.AuthType)
	}
}

func writeEnvelope(conn *websocket.Conn, msg sshEnvelope) {
	_ = conn.WriteJSON(msg)
}
