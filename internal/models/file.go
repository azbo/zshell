package models

type RemoteEntry struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	IsDir   bool   `json:"isDir"`
	Size    int64  `json:"size"`
	Mode    string `json:"mode"`
	ModTime string `json:"modTime"`
}

type RemoteListing struct {
	Path    string        `json:"path"`
	Entries []RemoteEntry `json:"entries"`
}
