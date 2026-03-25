package session

import (
	"path/filepath"
	"testing"

	"zshell/internal/models"
)

func TestAuthMethodForHostRequiresPassword(t *testing.T) {
	t.Parallel()

	_, err := authMethodForHost(models.Host{AuthType: models.AuthPassword}, "")
	if err == nil {
		t.Fatal("expected password auth to fail without password")
	}
}

func TestAuthMethodForHostRejectsMissingKey(t *testing.T) {
	t.Parallel()

	_, err := authMethodForHost(models.Host{
		AuthType: models.AuthKey,
		KeyPath:  filepath.Join(t.TempDir(), "missing-key"),
	}, "")
	if err == nil {
		t.Fatal("expected key auth to fail for missing key")
	}
}
