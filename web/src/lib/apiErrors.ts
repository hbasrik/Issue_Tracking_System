/** Maps backend domain/auth error strings to Turkish UI copy. */
export function apiErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : 'İşlem başarısız';
  switch (msg) {
    case 'invalid credentials':
      return 'E-posta veya şifre yanlış.';
    case 'password must be at least 8 characters':
      return 'Şifre en az 8 karakter olmalı.';
    case 'password must contain at least one letter and one digit':
      return 'Şifre en az bir harf ve bir rakam içermeli.';
    case 'new password and confirmation do not match':
      return 'Yeni şifre ve tekrarı eşleşmiyor.';
    case 'email is already in use':
      return 'Bu e-posta zaten kullanılıyor.';
    case 'you cannot reset your own password this way':
      return 'Kendi şifrenizi buradan sıfırlayamazsınız. Ayarlar’dan değiştirin.';
    case 'you cannot delete your own account':
      return 'Kendi hesabınızı silemezsiniz.';
    case 'you cannot change your own role':
      return 'Kendi rolünüzü değiştiremezsiniz.';
    case 'you cannot deactivate your own account':
      return 'Kendi hesabınızı pasife çekemezsiniz.';
    case 'cannot remove the last user who can manage users':
      return 'En az bir aktif yönetici kalmalıdır.';
    case 'full_name is required':
      return 'Ad soyad gerekli.';
    case 'email is required':
      return 'E-posta gerekli.';
    case 'email address is not valid':
      return 'Geçerli bir e-posta girin (alan adı uzantısı gerekli, örn. ad@sirket.com).';
    case 'entity not found':
      return 'Kayıt bulunamadı.';
    case 'operation not permitted for role':
      return 'Bu işlem için yetkiniz yok.';
    case 'account or role is inactive':
      return 'Hesap veya rol pasif.';
    case 'password must be changed before continuing':
      return 'Devam etmek için şifrenizi değiştirmeniz gerekiyor.';
    default:
      if (msg.startsWith('email domain is not allowed')) {
        const listed = msg.split('accepted domains:')[1]?.trim();
        return listed
          ? `Bu alan adına izin yok. Kabul edilenler: ${listed}`
          : 'Bu alan adına izin yok.';
      }
      return msg;
  }
}
