(() => {
  'use strict';
  const dialog=document.getElementById('pm-dialog'),opener=document.getElementById('pm-open'),frame=document.getElementById('pm-frame');
  let previousOverflow='';
  opener.addEventListener('click',()=>{
    if(!frame.src){
      const url=new URL(frame.dataset.src);
      frame.dataset.channel=crypto.randomUUID();
      url.searchParams.set('channel',frame.dataset.channel);
      frame.src=url.href;
    }
    previousOverflow=document.body.style.overflow;
    dialog.showModal();document.body.style.overflow='hidden';
  });
  document.getElementById('pm-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{document.body.style.overflow=previousOverflow;opener.focus();});
  // Destroy the embedded session when the dashboard signs out.
  function clearSession(){dialog.close();frame.removeAttribute('src');delete frame.dataset.channel;}
  document.getElementById('sms-signout').addEventListener('click',clearSession);
  window.addEventListener('ty:expense-signout',clearSession);
})();
