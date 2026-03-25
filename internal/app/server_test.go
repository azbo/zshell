package app

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"zshell/internal/models"
	"zshell/internal/storage"
)

func TestHealthz(t *testing.T) {
	t.Parallel()

	server := testServer(t)
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)

	server.mux.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}

	var payload map[string]string
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload["status"] != "ok" {
		t.Fatalf("expected status ok, got %q", payload["status"])
	}
}

func TestCreateAndListHost(t *testing.T) {
	t.Parallel()

	server := testServer(t)
	body := `{"name":"demo","address":"127.0.0.1","port":22,"username":"root","platform":"linux","authType":"password"}`

	postRecorder := httptest.NewRecorder()
	postRequest := httptest.NewRequest(http.MethodPost, "/api/hosts", strings.NewReader(body))
	postRequest.Header.Set("Content-Type", "application/json")
	server.mux.ServeHTTP(postRecorder, postRequest)
	if postRecorder.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", postRecorder.Code)
	}

	getRecorder := httptest.NewRecorder()
	getRequest := httptest.NewRequest(http.MethodGet, "/api/hosts", nil)
	server.mux.ServeHTTP(getRecorder, getRequest)
	if getRecorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", getRecorder.Code)
	}

	var payload []map[string]any
	if err := json.Unmarshal(getRecorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	if len(payload) != 1 {
		t.Fatalf("expected 1 host, got %d", len(payload))
	}
}

func TestListHostsDecoratesCredentialState(t *testing.T) {
	t.Parallel()

	store, err := storage.NewHostStore(filepath.Join(t.TempDir(), "hosts.json"))
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	if _, err := store.Save(models.Host{
		Name:     "demo",
		Address:  "127.0.0.1",
		Port:     22,
		Username: "root",
		Platform: models.PlatformLinux,
		AuthType: models.AuthPassword,
	}); err != nil {
		t.Fatalf("save host: %v", err)
	}

	server := newServerWithDependencies(store, fakeCredentialStore{}, fakeFileService{})
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/hosts", nil)
	server.mux.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}

	var payload []models.Host
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode payload: %v", err)
	}
	if len(payload) != 1 {
		t.Fatalf("expected 1 host, got %d", len(payload))
	}
	if !payload[0].HasPassword {
		t.Fatal("expected hasPassword to be true")
	}
	if payload[0].Password != "" {
		t.Fatal("expected password to be omitted from API response")
	}
}

func TestListFilesRoute(t *testing.T) {
	t.Parallel()

	store, err := storage.NewHostStore(filepath.Join(t.TempDir(), "hosts.json"))
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	saved, err := store.Save(models.Host{
		Name:     "demo",
		Address:  "127.0.0.1",
		Port:     22,
		Username: "root",
		Platform: models.PlatformLinux,
		AuthType: models.AuthPassword,
	})
	if err != nil {
		t.Fatalf("save host: %v", err)
	}

	server := newServerWithDependencies(store, fakeCredentialStore{}, fakeFileService{})
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/files/"+saved.ID+"/list", strings.NewReader(`{"path":".","password":"secret"}`))
	request.Header.Set("Content-Type", "application/json")

	server.mux.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}

	var payload map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode payload: %v", err)
	}
	if payload["path"] != "." {
		t.Fatalf("expected path '.', got %#v", payload["path"])
	}
}

func TestLocalListRoute(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "demo.txt"), []byte("demo"), 0o600); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	server := testServer(t)
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/local/list", strings.NewReader(`{"path":"`+filepath.ToSlash(dir)+`"}`))
	request.Header.Set("Content-Type", "application/json")

	server.mux.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}

	var payload models.RemoteListing
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode payload: %v", err)
	}
	if payload.Path != filepath.Clean(dir) {
		t.Fatalf("expected path %q, got %q", filepath.Clean(dir), payload.Path)
	}
	if len(payload.Entries) != 1 || payload.Entries[0].Name != "demo.txt" {
		t.Fatalf("unexpected local entries: %+v", payload.Entries)
	}
}

func TestUploadPathRoute(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	source := filepath.Join(dir, "upload.txt")
	if err := os.WriteFile(source, []byte("demo"), 0o600); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	store, err := storage.NewHostStore(filepath.Join(dir, "hosts.json"))
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	saved, err := store.Save(models.Host{
		Name:     "demo",
		Address:  "127.0.0.1",
		Port:     22,
		Username: "root",
		Platform: models.PlatformLinux,
		AuthType: models.AuthPassword,
	})
	if err != nil {
		t.Fatalf("save host: %v", err)
	}

	files := &recordingFileService{}
	server := newServerWithDependencies(store, fakeCredentialStore{}, files)
	recorder := httptest.NewRecorder()
	body := `{"path":".","password":"secret","localPath":"` + filepath.ToSlash(source) + `"}`
	request := httptest.NewRequest(http.MethodPost, "/api/files/"+saved.ID+"/upload-path", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")

	server.mux.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", recorder.Code)
	}
	if files.uploadFileName != "upload.txt" {
		t.Fatalf("expected upload file name upload.txt, got %q", files.uploadFileName)
	}
}

func TestDownloadToLocalRoute(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	store, err := storage.NewHostStore(filepath.Join(dir, "hosts.json"))
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	saved, err := store.Save(models.Host{
		Name:     "demo",
		Address:  "127.0.0.1",
		Port:     22,
		Username: "root",
		Platform: models.PlatformLinux,
		AuthType: models.AuthPassword,
	})
	if err != nil {
		t.Fatalf("save host: %v", err)
	}

	server := newServerWithDependencies(store, fakeCredentialStore{}, fakeFileService{})
	recorder := httptest.NewRecorder()
	body := `{"path":"/remote/demo.txt","password":"secret","localPath":"` + filepath.ToSlash(dir) + `"}`
	request := httptest.NewRequest(http.MethodPost, "/api/files/"+saved.ID+"/download-to-local", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")

	server.mux.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}

	content, err := os.ReadFile(filepath.Join(dir, "demo.txt"))
	if err != nil {
		t.Fatalf("read downloaded file: %v", err)
	}
	if string(content) != "demo" {
		t.Fatalf("expected downloaded content demo, got %q", string(content))
	}
}

func testServer(t *testing.T) *Server {
	t.Helper()

	store, err := storage.NewHostStore(filepath.Join(t.TempDir(), "hosts.json"))
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	return newServerWithStore(store)
}

type fakeCredentialStore struct{}

func (fakeCredentialStore) Get(hostID string) (string, bool, error) {
	return "secret", true, nil
}

func (fakeCredentialStore) Set(hostID, password string) error {
	return nil
}

func (fakeCredentialStore) Delete(hostID string) error {
	return nil
}

type fakeFileService struct{}

func (fakeFileService) List(hostID, password, remotePath string) (models.RemoteListing, error) {
	return models.RemoteListing{
		Path: remotePath,
		Entries: []models.RemoteEntry{
			{Name: "demo.txt", Path: remotePath + "/demo.txt"},
		},
	}, nil
}

func (fakeFileService) Upload(hostID, password, remotePath, fileName string, reader io.Reader) (models.RemoteEntry, error) {
	return models.RemoteEntry{Name: fileName, Path: remotePath + "/" + fileName}, nil
}

func (fakeFileService) Download(hostID, password, remotePath string) (io.ReadCloser, string, error) {
	return io.NopCloser(strings.NewReader("demo")), "demo.txt", nil
}

type recordingFileService struct {
	uploadFileName string
}

func (s *recordingFileService) List(hostID, password, remotePath string) (models.RemoteListing, error) {
	return fakeFileService{}.List(hostID, password, remotePath)
}

func (s *recordingFileService) Upload(hostID, password, remotePath, fileName string, reader io.Reader) (models.RemoteEntry, error) {
	s.uploadFileName = fileName
	return fakeFileService{}.Upload(hostID, password, remotePath, fileName, reader)
}

func (s *recordingFileService) Download(hostID, password, remotePath string) (io.ReadCloser, string, error) {
	return fakeFileService{}.Download(hostID, password, remotePath)
}
