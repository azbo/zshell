package app

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
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
