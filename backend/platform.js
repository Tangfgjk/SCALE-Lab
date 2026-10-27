"use strict";
const {app}=require('./app');
const {pool}=require('./db/pool');
const {configuration}=require('./config');
const config=configuration();
async function start(){
  await pool.query('SELECT 1');
  if(config.production){
    const {verifyPassword}=require('./auth');
    const rows=(await pool.query('SELECT password_hash FROM admin_password_credentials')).rows;
    for(const row of rows)for(const weak of ['admin','123456','password'])if(await verifyPassword(weak,row.password_hash))throw Error('Weak local demonstration account must be changed before production');
  }
  const server=app.listen(config.port,config.host,()=>console.log(`SCALE Lab platform: http://${config.host}:${config.port}/`));
  function stop(){server.close(async()=>{await pool.end();process.exit(0)});setTimeout(()=>process.exit(1),10000).unref()}
  process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
start().catch(error=>{console.error(error.message);pool.end();process.exitCode=1});
