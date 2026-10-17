export function nativeError(message = '', extensionId = '') {
  let reason;
  if (/not found|not registered/i.test(message)) {
    reason = 'Yardımcı kaydı bulunamadı. native/install.py komutunu bu eklentinin güncel kimliğiyle yeniden çalıştırın.';
  } else if (/forbidden|not allowed|access.*denied/i.test(message)) {
    reason = 'Yardımcı bu eklenti kimliğine izin vermiyor. Eklenti kimliği değişmiş olabilir; yardımcı kaydını güncelleyin.';
  } else if (/failed to start|cannot.*start|could not.*start/i.test(message)) {
    reason = 'Yardımcı EXE başlatılamadı. Kayıttaki EXE dosyasının mevcut olduğunu kontrol edin.';
  } else if (/exited|closed|disconnected/i.test(message)) {
    reason = 'Yardımcı bağlantıyı yanıt vermeden kapattı. EXE veya Native Messaging protokolü kontrol edilmeli.';
  } else reason = 'Yardımcı bağlantısı kurulamadı. Chrome hata ayrıntısını kontrol edin.';
  return `${reason} Eklenti kimliği: ${extensionId}. Chrome: ${message || 'Ayrıntı bildirilmedi.'}`;
}
