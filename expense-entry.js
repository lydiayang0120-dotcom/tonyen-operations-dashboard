(() => {
  'use strict';
  const dialog=document.getElementById('pm-dialog'),opener=document.getElementById('pm-open'),frame=document.getElementById('pm-frame');
  let previousOverflow='';
  opener.addEventListener('click',()=>{
    if(!frame.src)frame.src=frame.dataset.src;
    previousOverflow=document.body.style.overflow;
    dialog.showModal();document.body.style.overflow='hidden';
  });
  document.getElementById('pm-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{document.body.style.overflow=previousOverflow;opener.focus();});
  // Destroy the embedded session when the dashboard signs out.
  document.getElementById('sms-signout').addEventListener('click',()=>{dialog.close();frame.removeAttribute('src');});
})();

