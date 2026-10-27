(function(root){
  "use strict";
  const rules=Object.freeze({newsSummaryMax:500,activitySummaryMax:1000});
  if(typeof module!=="undefined"&&module.exports)module.exports=rules;
  else root.ScaleContentRules=rules;
})(typeof window!=="undefined"?window:globalThis);
