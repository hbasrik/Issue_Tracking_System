package domain

import "testing"

func TestIsNonWebImage(t *testing.T) {
	heicHead := []byte{
		0x00, 0x00, 0x00, 0x18,
		'f', 't', 'y', 'p',
		'h', 'e', 'i', 'c',
	}
	jpegHead := []byte{0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 'J', 'F', 'I', 'F'}

	cases := []struct {
		name string
		mime string
		file string
		head []byte
		want bool
	}{
		{name: "jpeg", mime: "image/jpeg", file: "a.jpg", head: jpegHead, want: false},
		{name: "png", mime: "image/png", file: "a.png", head: nil, want: false},
		{name: "heic mime", mime: "image/heic", file: "a.jpg", head: jpegHead, want: true},
		{name: "heif mime", mime: "image/heif", file: "a.jpg", head: nil, want: true},
		{name: "heic ext", mime: "application/octet-stream", file: "IMG_001.HEIC", head: nil, want: true},
		{name: "heic magic", mime: "image/jpeg", file: "a.jpg", head: heicHead, want: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := IsNonWebImage(tc.mime, tc.file, tc.head)
			if got != tc.want {
				t.Fatalf("got %v, want %v", got, tc.want)
			}
		})
	}
}
