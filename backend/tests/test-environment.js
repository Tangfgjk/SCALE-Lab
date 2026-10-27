"use strict";
const url=process.env.DATABASE_URL;
const base=process.env.TEST_BASE_URL;
if(process.env.NODE_ENV!=='test'||!url||!base||!/_test$/.test(new URL(url).pathname)||new URL(base).port==='3004'||!process.env.MEDIA_ROOT)throw Error('Write tests require NODE_ENV=test, a *_test database, explicit TEST_BASE_URL (not 3004), and isolated MEDIA_ROOT.');
module.exports={base};
