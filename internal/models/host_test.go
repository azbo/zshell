package models

import "testing"

func TestHostNormalizeDefaultsPort(t *testing.T) {
	t.Parallel()

	host := (Host{
		Name:     " demo ",
		Address:  " 10.0.0.8 ",
		Username: " admin ",
		Platform: "LINUX",
		AuthType: "PASSWORD",
	}).Normalize()

	if host.Port != 22 {
		t.Fatalf("expected default port 22, got %d", host.Port)
	}
	if host.Name != "demo" || host.Address != "10.0.0.8" || host.Username != "admin" {
		t.Fatal("expected fields to be trimmed")
	}
	if host.Platform != PlatformLinux {
		t.Fatalf("expected platform %q, got %q", PlatformLinux, host.Platform)
	}
	if host.AuthType != AuthPassword {
		t.Fatalf("expected auth type %q, got %q", AuthPassword, host.AuthType)
	}
}

func TestHostValidateRejectsBadKeyAuth(t *testing.T) {
	t.Parallel()

	err := (Host{
		Name:     "prod",
		Address:  "10.0.0.9",
		Port:     22,
		Username: "root",
		Platform: PlatformLinux,
		AuthType: AuthKey,
	}).Validate()
	if err == nil {
		t.Fatal("expected key auth validation error")
	}
}
