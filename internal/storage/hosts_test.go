package storage

import (
	"path/filepath"
	"testing"

	"zshell/internal/models"
)

func TestHostStoreSaveListDelete(t *testing.T) {
	t.Parallel()

	store, err := NewHostStore(filepath.Join(t.TempDir(), "hosts.json"))
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	saved, err := store.Save(models.Host{
		Name:     "prod-linux",
		Address:  "10.0.0.1",
		Port:     22,
		Username: "root",
		Platform: models.PlatformLinux,
		AuthType: models.AuthPassword,
	})
	if err != nil {
		t.Fatalf("save host: %v", err)
	}
	if saved.ID == "" {
		t.Fatal("expected generated ID")
	}

	hosts, err := store.List()
	if err != nil {
		t.Fatalf("list hosts: %v", err)
	}
	if len(hosts) != 1 {
		t.Fatalf("expected 1 host, got %d", len(hosts))
	}

	saved.Name = "prod-linux-updated"
	if _, err := store.Save(saved); err != nil {
		t.Fatalf("update host: %v", err)
	}

	got, ok, err := store.Get(saved.ID)
	if err != nil {
		t.Fatalf("get host: %v", err)
	}
	if !ok {
		t.Fatal("expected host to exist")
	}
	if got.Name != "prod-linux-updated" {
		t.Fatalf("expected updated name, got %q", got.Name)
	}

	if err := store.Delete(saved.ID); err != nil {
		t.Fatalf("delete host: %v", err)
	}

	hosts, err = store.List()
	if err != nil {
		t.Fatalf("list hosts after delete: %v", err)
	}
	if len(hosts) != 0 {
		t.Fatalf("expected 0 hosts after delete, got %d", len(hosts))
	}
}

func TestHostStoreRejectsInvalidHost(t *testing.T) {
	t.Parallel()

	store, err := NewHostStore(filepath.Join(t.TempDir(), "hosts.json"))
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	_, err = store.Save(models.Host{
		Name:     "broken",
		Address:  "",
		Port:     22,
		Username: "root",
		Platform: models.PlatformLinux,
		AuthType: models.AuthPassword,
	})
	if err == nil {
		t.Fatal("expected validation error")
	}
}
