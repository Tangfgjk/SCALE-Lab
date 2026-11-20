"use strict";
const fail=message=>Object.assign(Error(message),{status:400,code:'INVALID_ACHIEVEMENT'});
function achievement(body){
  const achievementType=body.achievementType||'paper',raw=body.metadata||{},metadata={};
  if(!['paper','patent','software'].includes(achievementType)||typeof raw!=='object'||Array.isArray(raw))throw fail('成果类型或资料格式无效');
  const fields=achievementType==='patent'?['patentType','patentStatus','applicationNumber','patentNumber','appliedOn','grantedOn']:achievementType==='software'?['softwareVersion','registrationNumber','registeredOn']:[];
  for(const key of fields){metadata[key]=String(raw[key]||'').trim();if(metadata[key].length>200)throw fail('成果字段过长');if(/On$/.test(key)&&metadata[key]){const date=metadata[key];if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw fail('成果日期无效')}}
  metadata.keywords=raw.keywords||[];if(!Array.isArray(metadata.keywords)||metadata.keywords.length>20||metadata.keywords.some(x=>typeof x!=='string'||!x.trim()||x.length>80))throw fail('关键词最多 20 个，每个 80 字');
  for(const key of ['codeUrl','demoUrl'])if(raw[key]){const value=String(raw[key]).trim();let url;try{url=new URL(value)}catch{throw fail('代码或演示链接无效')}if(value.length>2000||!['https:','http:'].includes(url.protocol)||url.username||url.password)throw fail('代码或演示链接须为普通 HTTP(S) 地址');metadata[key]=value}
  if(achievementType==='patent'){
    if(!['invention','utility','design','unspecified'].includes(metadata.patentType)||!['applied','published','granted','expired','unspecified'].includes(metadata.patentStatus)||(!metadata.applicationNumber&&!metadata.patentNumber))throw fail('请填写专利类型、状态及申请号或专利号');
    if(metadata.patentStatus==='granted'&&(!metadata.patentNumber||!metadata.grantedOn))throw fail('已授权专利须有专利号和授权日期');
    if(metadata.appliedOn&&metadata.grantedOn&&metadata.appliedOn>metadata.grantedOn)throw fail('授权日期不能早于申请日期');
  }
  if(achievementType==='software'&&(!metadata.softwareVersion||!metadata.registrationNumber||!metadata.registeredOn))throw fail('请填写软件版本、登记号及登记日期');
  return{achievementType,metadata};
}
module.exports={achievement};
