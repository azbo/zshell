package app

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"zshell/internal/models"
)

func listLocalFiles(requestPath string) (models.RemoteListing, error) {
	targetPath, err := normalizeLocalPath(requestPath)
	if err != nil {
		return models.RemoteListing{}, err
	}

	entries, err := os.ReadDir(targetPath)
	if err != nil {
		return models.RemoteListing{}, err
	}

	items := make([]models.RemoteEntry, 0, len(entries))
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			return models.RemoteListing{}, err
		}
		items = append(items, models.RemoteEntry{
			Name:    entry.Name(),
			Path:    filepath.Join(targetPath, entry.Name()),
			IsDir:   entry.IsDir(),
			Size:    info.Size(),
			Mode:    info.Mode().String(),
			ModTime: info.ModTime().Format(time.RFC3339),
		})
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].IsDir != items[j].IsDir {
			return items[i].IsDir
		}
		return strings.ToLower(items[i].Name) < strings.ToLower(items[j].Name)
	})

	return models.RemoteListing{
		Path:    targetPath,
		Entries: items,
	}, nil
}

func uploadLocalPathToRemote(files fileService, hostID, password, remotePath, localPath string) (models.RemoteEntry, error) {
	targetPath, err := normalizeLocalPath(localPath)
	if err != nil {
		return models.RemoteEntry{}, err
	}

	info, err := os.Stat(targetPath)
	if err != nil {
		return models.RemoteEntry{}, err
	}
	if info.IsDir() {
		return models.RemoteEntry{}, errors.New("cannot upload a directory")
	}

	file, err := os.Open(targetPath)
	if err != nil {
		return models.RemoteEntry{}, err
	}
	defer file.Close()

	return files.Upload(hostID, password, remotePath, filepath.Base(targetPath), file)
}

func saveRemoteFileToLocalPath(localPath, fileName string, stream io.Reader) (string, error) {
	targetDir, err := normalizeLocalPath(localPath)
	if err != nil {
		return "", err
	}

	info, err := os.Stat(targetDir)
	if err != nil {
		return "", err
	}
	if !info.IsDir() {
		return "", errors.New("local path must be a directory")
	}

	targetPath := filepath.Join(targetDir, fileName)
	file, err := os.Create(targetPath)
	if err != nil {
		return "", err
	}
	defer file.Close()

	if _, err := io.Copy(file, stream); err != nil {
		return "", err
	}

	return targetPath, nil
}

func normalizeLocalPath(requestPath string) (string, error) {
	trimmed := strings.TrimSpace(requestPath)
	if trimmed == "" || trimmed == "." {
		return defaultLocalPath()
	}

	if filepath.IsAbs(trimmed) {
		return filepath.Clean(trimmed), nil
	}

	base, err := defaultLocalPath()
	if err != nil {
		return "", err
	}

	return filepath.Clean(filepath.Join(base, trimmed)), nil
}

func defaultLocalPath() (string, error) {
	home, err := os.UserHomeDir()
	if err == nil && home != "" {
		return filepath.Clean(home), nil
	}

	current, err := os.Getwd()
	if err != nil {
		return "", err
	}

	return filepath.Clean(current), nil
}
