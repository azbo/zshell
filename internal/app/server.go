package app

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"io"
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
	files      fileService
	mux        *http.ServeMux
	httpServer *http.Server
	baseURL    string
}

type fileService interface {
	List(hostID, password, remotePath string) (models.RemoteListing, error)
	Upload(hostID, password, remotePath, fileName string, reader io.Reader) (models.RemoteEntry, error)
	Download(hostID, password, remotePath string) (io.ReadCloser, string, error)
}

func NewServer() (*Server, error) {
	store, err := storage.NewHostStore("")
	if err != nil {
		return nil, err
	}

	return newServerWithDependencies(store, session.NewFileService(store)), nil
}

func newServerWithStore(store *storage.HostStore) *Server {
	return newServerWithDependencies(store, session.NewFileService(store))
}

func newServerWithDependencies(store *storage.HostStore, files fileService) *Server {
	server := &Server{
		store: store,
		files: files,
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
	s.mux.HandleFunc("/api/files/", s.handleFiles)
	s.mux.Handle("/ws/sessions", session.NewSSHHandler(s.store))

	distFS, err := fs.Sub(embeddedFiles, "frontend/dist")
	if err != nil {
		panic(err)
	}
	s.mux.Handle("/", http.FileServer(http.FS(distFS)))
}

type fileRequest struct {
	Path     string `json:"path"`
	Password string `json:"password"`
}

func (s *Server) handleFiles(w http.ResponseWriter, r *http.Request) {
	trimmed := strings.TrimPrefix(r.URL.Path, "/api/files/")
	parts := strings.SplitN(trimmed, "/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	hostID := parts[0]
	action := parts[1]

	switch action {
	case "list":
		s.handleFileList(w, r, hostID)
	case "upload":
		s.handleFileUpload(w, r, hostID)
	case "download":
		s.handleFileDownload(w, r, hostID)
	default:
		w.WriteHeader(http.StatusNotFound)
	}
}

func (s *Server) handleFileList(w http.ResponseWriter, r *http.Request, hostID string) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var request fileRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	listing, err := s.files.List(hostID, request.Password, request.Path)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, listing)
}

func (s *Server) handleFileUpload(w http.ResponseWriter, r *http.Request, hostID string) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	password := r.FormValue("password")
	remotePath := r.FormValue("path")
	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	defer file.Close()

	entry, err := s.files.Upload(hostID, password, remotePath, header.Filename, file)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusCreated, entry)
}

func (s *Server) handleFileDownload(w http.ResponseWriter, r *http.Request, hostID string) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var request fileRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	stream, fileName, err := s.files.Download(hostID, request.Password, request.Path)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	defer stream.Close()

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", fileName))
	if _, err := io.Copy(w, stream); err != nil {
		writeError(w, http.StatusInternalServerError, err)
	}
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
