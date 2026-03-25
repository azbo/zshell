package app

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"

	"zshell/internal/models"
	"zshell/internal/session"
	"zshell/internal/storage"
)

//go:embed all:frontend/dist
var embeddedFiles embed.FS

type Server struct {
	store      *storage.HostStore
	mux        *http.ServeMux
	httpServer *http.Server
	baseURL    string
}

func NewServer() (*Server, error) {
	store, err := storage.NewHostStore("")
	if err != nil {
		return nil, err
	}

	return newServerWithStore(store), nil
}

func newServerWithStore(store *storage.HostStore) *Server {
	server := &Server{
		store: store,
		mux:   http.NewServeMux(),
	}
	server.routes()
	return server
}

func (s *Server) Run() error {
	addr := os.Getenv("ZSHELL_ADDR")
	if addr == "" {
		addr = "127.0.0.1:0"
	}

	open := os.Getenv("ZSHELL_NO_BROWSER") != "1"
	return s.serveBlocking(addr, open)
}

func (s *Server) Start(addr string, shouldOpenBrowser bool) (string, error) {
	if addr == "" {
		addr = "127.0.0.1:0"
	}

	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return "", err
	}

	url := "http://" + listener.Addr().String()
	s.baseURL = url
	s.httpServer = &http.Server{Handler: s.mux}

	log.Printf("zshell listening on %s", url)
	if shouldOpenBrowser {
		go openBrowser(url)
	}

	go func() {
		if err := s.httpServer.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("zshell server stopped: %v", err)
		}
	}()

	return url, nil
}

func (s *Server) URL() string {
	return s.baseURL
}

func (s *Server) Shutdown(ctx context.Context) error {
	if s.httpServer == nil {
		return nil
	}
	return s.httpServer.Shutdown(ctx)
}

func (s *Server) serveBlocking(addr string, shouldOpenBrowser bool) error {
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	defer listener.Close()

	url := "http://" + listener.Addr().String()
	log.Printf("zshell listening on %s", url)
	if shouldOpenBrowser {
		go openBrowser(url)
	}
	s.baseURL = url
	s.httpServer = &http.Server{Handler: s.mux}
	return s.httpServer.Serve(listener)
}

func (s *Server) routes() {
	s.mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	s.mux.HandleFunc("/api/hosts", s.handleHosts)
	s.mux.HandleFunc("/api/hosts/", s.handleHostByID)
	s.mux.Handle("/ws/sessions", session.NewSSHHandler(s.store))

	distFS, err := fs.Sub(embeddedFiles, "frontend/dist")
	if err != nil {
		panic(err)
	}
	s.mux.Handle("/", http.FileServer(http.FS(distFS)))
}

func (s *Server) handleHosts(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		hosts, err := s.store.List()
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, hosts)
	case http.MethodPost:
		var host models.Host
		if err := json.NewDecoder(r.Body).Decode(&host); err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		saved, err := s.store.Save(host)
		if err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		writeJSON(w, http.StatusCreated, saved)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleHostByID(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/hosts/")
	if id == "" {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	switch r.Method {
	case http.MethodPut:
		var host models.Host
		if err := json.NewDecoder(r.Body).Decode(&host); err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		host.ID = id
		saved, err := s.store.Save(host)
		if err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		writeJSON(w, http.StatusOK, saved)
	case http.MethodDelete:
		if err := s.store.Delete(id); err != nil {
			status := http.StatusBadRequest
			if errors.Is(err, storage.ErrHostNotFound) {
				status = http.StatusNotFound
			}
			writeError(w, status, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	if err := cmd.Start(); err != nil {
		log.Printf("open browser: %v", err)
	}
}
