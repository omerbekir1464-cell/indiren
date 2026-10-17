// Listen from document_start so EME events are not missed while the popup is closed.
// Only report a boolean; never inspect initialization data or license messages.
document.addEventListener('encrypted', () => {
  chrome.runtime.sendMessage({type:'drm-detected'}).catch(() => {});
}, true);
