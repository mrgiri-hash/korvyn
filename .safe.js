/* SAFE STRING SURGERY FOR index.html.
   `String.replace(needle, replacement)` treats `$'`, `$&`, `` $` `` and `$1` in the REPLACEMENT
   as substitution patterns. A block of JS that builds a currency string with `'$'+v` therefore
   contains `$'` — "everything after the match" — and splicing it grew a 4.6 MB file to 6.7 MB
   in one call, with no error. Every replacement here goes through a FUNCTION replacer, which is
   never interpreted.

   Exported so every splice in this session uses it:
     const {sub, subOnce, splice} = require('./.safe.js')(path)
*/
const fs=require('fs');
module.exports=function(F){
  let s=fs.readFileSync(F,'utf8');
  /* DETECT THE FILE'S OWN LINE ENDING, NEVER ASSUME IT. The working tree is CRLF and the git
     blob is LF, so a `git checkout` hands the file back with LF and every multi-line anchor
     written against CRLF then matches zero times — with a confusing "anchor occurs 0" on text
     that is visibly present. */
  const NL = s.indexOf('\r\n')>=0 ? '\r\n' : '\n';
  const must=(c,m)=>{ if(!c) throw new Error(m); };
  const api={
    NL,
    J:(...x)=>x.join(NL),
    get text(){ return s; },
    /* replace `a` with `b` exactly `want` times (default 1), asserting the count */
    sub(a,b,want){
      const n=s.split(a).length-1;
      must(n===(want||1),'anchor occurs '+n+', expected '+(want||1)+': '+JSON.stringify(a.slice(0,90)));
      s=s.split(a).join(b);                      // split/join never interprets $
      return api;
    },
    /* insert a block before or after a unique anchor; 'after' requires the next line to close
       a block at column 0, or the block lands inside a function body as unreachable code */
    splice(blockPath,anchor,where){
      const block=fs.readFileSync(blockPath,'utf8').replace(/\r?\n/g,NL).replace(/\s+$/,'')+NL;
      must(s.indexOf(block)<0,'block already present: '+blockPath);
      const n=s.split(anchor).length-1;
      must(n===1,'anchor occurs '+n+': '+anchor.slice(0,80));
      if(where==='after'){
        const i=s.indexOf(anchor)+anchor.length;
        const m=s.slice(i).match(/^\r?\n\}\r?\n/);
        must(m,'refusing: the line after the anchor is not a top-level "}"');
        s=s.slice(0,i)+m[0]+block+s.slice(i+m[0].length);
      }else{
        const i=s.indexOf(anchor);
        s=s.slice(0,i)+block+s.slice(i);
      }
      return api;
    },
    write(){ fs.writeFileSync(F,s); return s.length; },
  };
  return api;
};
