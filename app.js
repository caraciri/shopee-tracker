(()=>{'use strict';
const STORE='meta_shopee_tracker_v4',URL_KEY='meta_shopee_script_url',SHEETS_KEY='meta_shopee_sheets_data_v4',TOKEN_KEY='meta_shopee_secret_token',LIMIT=10,STATUSES=['SCALE','HOLD','WATCH','KILL'];
let entries=parse(localStorage.getItem(STORE),[]),sheets=parse(localStorage.getItem(SHEETS_KEY),[]),scriptUrl=localStorage.getItem(URL_KEY)||'',secret=localStorage.getItem(TOKEN_KEY)||'',range='7days',showAll=false,chart=null,editing=null;
const $=id=>document.getElementById(id),ids=['campaign','adset','creative','hook','product','link','spend','d0','d1','d3','d7','clicks','note'];
function parse(v,f){try{return v?JSON.parse(v):f}catch