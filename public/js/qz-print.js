// QZ Tray integration helper
// 1. Copy qz-tray.js from your QZ Tray install into public/js (or use official signed CDN if licensed)
// 2. Ensure QZ Tray client app is running on the kiosk machine.
// 3. Replace certificate/signature logic for production security.

window.QZPrint = (function(){
  const state = { connecting:false, ready:false, printer:null };

  if (window.qz && qz.security) {
    // Certificate (placeholder). Replace with real certificate string without line breaks.
    qz.security.setCertificatePromise(() => Promise.resolve("-----BEGIN CERTIFICATE-----\nREPLACE_WITH_CERT\n-----END CERTIFICATE-----\n"));
    // Signature (placeholder). Implement a server-based signing API for security.
    qz.security.setSignaturePromise(hash => Promise.resolve(null)); // DEV ONLY (NOT SECURE)
  }

  function connect(){
    if(!window.qz){ return Promise.reject('qz-tray.js not loaded'); }
    if(state.ready || state.connecting) return Promise.resolve();
    state.connecting = true;
    return qz.websocket.connect().then(()=>{ state.ready=true; state.connecting=false; })
      .catch(e=>{ state.connecting=false; throw e; });
  }

  function findPrinter(preferred){
    return connect().then(()=> preferred ? qz.printers.find(preferred) : qz.printers.getDefault())
      .then(p=>{ state.printer=p; return p; });
  }

  function printHTML(html, preferred){
    return findPrinter(preferred).then(pr => {
      const config = qz.configs.create(pr, { scaleContent:true });
      return qz.printHTML(config, [{ html }]);
    });
  }

  return { connect, printHTML, state };
})();
