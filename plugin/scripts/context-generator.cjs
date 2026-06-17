"use strict";var Wt=Object.create;var V=Object.defineProperty;var Yt=Object.getOwnPropertyDescriptor;var Vt=Object.getOwnPropertyNames;var qt=Object.getPrototypeOf,Kt=Object.prototype.hasOwnProperty;var Jt=(r,e)=>{for(var t in e)V(r,t,{get:e[t],enumerable:!0})},ve=(r,e,t,s)=>{if(e&&typeof e=="object"||typeof e=="function")for(let n of Vt(e))!Kt.call(r,n)&&n!==t&&V(r,n,{get:()=>e[n],enumerable:!(s=Yt(e,n))||s.enumerable});return r};var w=(r,e,t)=>(t=r!=null?Wt(qt(r)):{},ve(e||!r||!r.__esModule?V(t,"default",{value:r,enumerable:!0}):t,r)),Qt=r=>ve(V({},"__esModule",{value:!0}),r);var vs={};Jt(vs,{generateContext:()=>Ie});module.exports=Qt(vs);var Xt=w(require("path"),1),Gt=require("os"),Bt=require("fs");var me=require("bun:sqlite"),Z=require("fs");var g=require("path"),ae=require("os"),y=require("fs"),ye=require("url"),as={};function zt(){return typeof __dirname<"u"?__dirname:(0,g.dirname)((0,ye.fileURLToPath)(as.url))}var Zt=zt();function es(){if(process.env.CLAUDE_MEM_DATA_DIR)return process.env.CLAUDE_MEM_DATA_DIR;let r=(0,g.join)((0,ae.homedir)(),".claude-mem"),e=(0,g.join)(r,"settings.json");try{if((0,y.existsSync)(e)){let t=JSON.parse((0,y.readFileSync)(e,"utf-8")),s=t.env??t;if(s.CLAUDE_MEM_DATA_DIR)return s.CLAUDE_MEM_DATA_DIR}}catch{}return r}var O=es(),U=process.env.CLAUDE_CONFIG_DIR||(0,g.join)((0,ae.homedir)(),".claude"),xs=(0,g.join)(U,"plugins","marketplaces","thedotmack"),ts=(0,g.join)(O,"archives"),ss=(0,g.join)(O,"logs"),rs=(0,g.join)(O,"trash"),ns=(0,g.join)(O,"backups"),os=(0,g.join)(O,"modes"),_e=(0,g.join)(O,"settings.json"),Ue=(0,g.join)(O,"claude-mem.db"),is=(0,g.join)(O,"vector-db"),xe=(0,g.join)(O,"observer-sessions"),de=(0,g.basename)(xe),ks=(0,g.join)(U,"settings.json"),Fs=(0,g.join)(U,"commands"),ws=(0,g.join)(U,"CLAUDE.md");function ke(r){(0,y.mkdirSync)(r,{recursive:!0})}function Fe(){return(0,g.join)(Zt,"..")}var v={dataDir:()=>O,workerPid:()=>(0,g.join)(O,"worker.pid"),serverBetaPid:()=>(0,g.join)(O,".server-beta.pid"),serverBetaPort:()=>(0,g.join)(O,".server-beta.port"),serverBetaRuntime:()=>(0,g.join)(O,".server-beta.runtime.json"),settings:()=>(0,g.join)(O,"settings.json"),database:()=>(0,g.join)(O,"claude-mem.db"),chroma:()=>(0,g.join)(O,"chroma"),combinedCerts:()=>(0,g.join)(O,"combined_certs.pem"),transcriptsConfig:()=>(0,g.join)(O,"transcript-watch.json"),transcriptsState:()=>(0,g.join)(O,"transcript-watch-state.json"),syncState:()=>(0,g.join)(O,"sync-state.json"),corpora:()=>(0,g.join)(O,"corpora"),supervisorRegistry:()=>(0,g.join)(O,"supervisor.json"),envFile:()=>(0,g.join)(O,".env"),logsDir:()=>ss,archives:()=>ts,trash:()=>rs,backups:()=>ns,modes:()=>os,vectorDb:()=>is,observerSessions:()=>xe};var M=require("fs"),we=require("path");var pe=(o=>(o[o.DEBUG=0]="DEBUG",o[o.INFO=1]="INFO",o[o.WARN=2]="WARN",o[o.ERROR=3]="ERROR",o[o.SILENT=4]="SILENT",o))(pe||{}),ue=class{level=null;useColor;logFilePath=null;logFileInitialized=!1;constructor(){this.useColor=process.stdout.isTTY??!1}ensureLogFileInitialized(){if(!this.logFileInitialized){this.logFileInitialized=!0;try{let e=v.logsDir();(0,M.existsSync)(e)||(0,M.mkdirSync)(e,{recursive:!0});let t=new Date().toISOString().split("T")[0];this.logFilePath=(0,we.join)(e,`claude-mem-${t}.log`)}catch(e){console.error("[LOGGER] Failed to initialize log file:",e instanceof Error?e.message:String(e)),this.logFilePath=null}}}getLevel(){if(this.level===null)try{let e=v.settings();if((0,M.existsSync)(e)){let t=(0,M.readFileSync)(e,"utf-8"),n=(JSON.parse(t).CLAUDE_MEM_LOG_LEVEL||"INFO").toUpperCase();this.level=pe[n]??1}else this.level=1}catch(e){console.error("[LOGGER] Failed to load log level from settings:",e instanceof Error?e.message:String(e)),this.level=1}return this.level}correlationId(e,t){return`obs-${e}-${t}`}sessionId(e){return`session-${e}`}formatData(e){if(e==null)return"";if(typeof e=="string")return e;if(typeof e=="number"||typeof e=="boolean")return e.toString();if(typeof e=="object"){if(e instanceof Error)return this.getLevel()===0?`${e.message}
${e.stack}`:e.message;if(Array.isArray(e))return`[${e.length} items]`;let t=Object.keys(e);return t.length===0?"{}":t.length<=3?JSON.stringify(e):`{${t.length} keys: ${t.slice(0,3).join(", ")}...}`}return String(e)}formatTool(e,t){if(!t)return e;let s=t;if(typeof t=="string")try{s=JSON.parse(t)}catch{s=t}if(e==="Bash"&&s.command)return`${e}(${s.command})`;if(s.file_path)return`${e}(${s.file_path})`;if(s.notebook_path)return`${e}(${s.notebook_path})`;if(e==="Glob"&&s.pattern)return`${e}(${s.pattern})`;if(e==="Grep"&&s.pattern)return`${e}(${s.pattern})`;if(s.url)return`${e}(${s.url})`;if(s.query)return`${e}(${s.query})`;if(e==="Task"){if(s.subagent_type)return`${e}(${s.subagent_type})`;if(s.description)return`${e}(${s.description})`}return e==="Skill"&&s.skill?`${e}(${s.skill})`:e==="LSP"&&s.operation?`${e}(${s.operation})`:e}formatTimestamp(e){let t=e.getFullYear(),s=String(e.getMonth()+1).padStart(2,"0"),n=String(e.getDate()).padStart(2,"0"),o=String(e.getHours()).padStart(2,"0"),i=String(e.getMinutes()).padStart(2,"0"),a=String(e.getSeconds()).padStart(2,"0"),_=String(e.getMilliseconds()).padStart(3,"0");return`${t}-${s}-${n} ${o}:${i}:${a}.${_}`}log(e,t,s,n,o){if(e<this.getLevel())return;this.ensureLogFileInitialized();let i=this.formatTimestamp(new Date),a=pe[e].padEnd(5),_=t.padEnd(6),p="";n?.correlationId?p=`[${n.correlationId}] `:n?.sessionId&&(p=`[session-${n.sessionId}] `);let E="";if(o!=null)if(o instanceof Error)E=this.getLevel()===0?`
${o.message}
${o.stack}`:` ${o.message}`;else if(this.getLevel()===0&&typeof o=="object")try{E=`
`+JSON.stringify(o,null,2)}catch{E=" "+this.formatData(o)}else E=" "+this.formatData(o);let c="";if(n){let{sessionId:l,memorySessionId:T,correlationId:b,...S}=n;Object.keys(S).length>0&&(c=` {${Object.entries(S).map(([f,R])=>`${f}=${R}`).join(", ")}}`)}let m=`[${i}] [${a}] [${_}] ${p}${s}${c}${E}`;if(this.logFilePath)try{(0,M.appendFileSync)(this.logFilePath,m+`
`,"utf8")}catch(l){process.stderr.write(`[LOGGER] Failed to write to log file: ${l instanceof Error?l.message:String(l)}
`)}else process.stderr.write(m+`
`)}debug(e,t,s,n){this.log(0,e,t,s,n)}info(e,t,s,n){this.log(1,e,t,s,n)}warn(e,t,s,n){this.log(2,e,t,s,n)}error(e,t,s,n){this.log(3,e,t,s,n)}dataIn(e,t,s,n){this.info(e,`\u2192 ${t}`,s,n)}dataOut(e,t,s,n){this.info(e,`\u2190 ${t}`,s,n)}success(e,t,s,n){this.info(e,`\u2713 ${t}`,s,n)}failure(e,t,s,n){this.error(e,`\u2717 ${t}`,s,n)}timing(e,t,s,n){this.info(e,`\u23F1 ${t}`,n,{duration:`${s}ms`})}happyPathError(e,t,s,n,o=""){let p=((new Error().stack||"").split(`
`)[2]||"").match(/at\s+(?:.*\s+)?\(?([^:]+):(\d+):(\d+)\)?/),E=p?`${p[1].split("/").pop()}:${p[2]}`:"unknown",c={...s,location:E};return this.warn(e,`[HAPPY-PATH] ${t}`,c,n),o}},d=new ue;var Ge=require("crypto");var je=require("os"),Ee=w(require("path"),1);var K=require("fs"),q=w(require("path"),1),P={isWorktree:!1,parentRepoPath:null};function Pe(r){let e=q.default.join(r,".git"),t;try{t=(0,K.statSync)(e)}catch(p){return p instanceof Error&&p.code!=="ENOENT"&&console.warn("[worktree] Unexpected error checking .git:",p),P}if(!t.isFile())return P;let s;try{s=(0,K.readFileSync)(e,"utf-8").trim()}catch(p){return console.warn("[worktree] Failed to read .git file:",p instanceof Error?p.message:String(p)),P}let n=s.match(/^gitdir:\s*(.+)$/);if(!n)return P;let o=n[1],a=(q.default.isAbsolute(o)?o:q.default.resolve(r,o)).match(/^(.+)[/\\]\.git[/\\]worktrees[/\\]([^/\\]+)$/);return a?{isWorktree:!0,parentRepoPath:a[1]}:P}function _s(r){return r==="~"||r.startsWith("~/")?r.replace(/^~/,(0,je.homedir)()):r}function Xe(r){let e=_s(r);return/^[A-Za-z]:([\\/].*)?$/.test(e)?Ee.default.win32.resolve(e):Ee.default.resolve(e)}var $e=new Map;function ds(r){if(!r||r.trim()==="")return d.warn("PROJECT_NAME","Empty cwd provided, using fallback",{cwd:r}),"unknown-project";let e=Xe(r),t=$e.get(e);if(t)return t;let s=e;return $e.set(e,s),s}var ps={primary:"unknown-project",parent:null,isWorktree:!1,allProjects:["unknown-project"]},He=new Map;function le(r){if(!r||r.trim()==="")return ps;let e=Xe(r),t=He.get(e);if(t)return t;let s=e,n=Pe(e),o;if(n.isWorktree&&n.parentRepoPath){let i=ds(n.parentRepoPath);o={primary:s,parent:i,isWorktree:!0,allProjects:[i,s]}}else o={primary:s,parent:null,isWorktree:!1,allProjects:[s]};return He.set(e,o),o}function J(r,e,t){return(0,Ge.createHash)("sha256").update([r||"",e||"",t||""].join("\0")).digest("hex").slice(0,16)}function ce(r){if(!r)return[];try{let e=JSON.parse(r);return Array.isArray(e)?e:[String(e)]}catch{return[r]}}var A="claude";function us(r){return r.trim().toLowerCase().replace(/\s+/g,"-")}function x(r){if(!r)return A;let e=us(r);return e?e==="transcript"||e.includes("codex")?"codex":e.includes("cursor")?"cursor":e.includes("claude")?"claude":e:A}function Be(r){let e=["claude","codex","cursor"];return[...r].sort((t,s)=>{let n=e.indexOf(t),o=e.indexOf(s);return n!==-1||o!==-1?n===-1?1:o===-1?-1:n-o:t.localeCompare(s)})}var L=require("fs"),j=require("path"),Ve=require("os"),qe=require("crypto");var We=require("os"),$;function H(){if($!==void 0)return $;try{let r=(0,We.userInfo)().username;$=typeof r=="string"&&r.length>0?r:null}catch{$=null}return $}var Es=/^[A-Za-z0-9._ -]+$/,k;function Q(r){if(k!==void 0)return k;let e=r??v.settings(),t=ls(e,"CLAUDE_MEM_USER_LABEL");if(t&&t.trim().length>0)return k=Ye(t.trim()),k;let s=H(),n=Ye(s??"unknown");try{cs(e,n)}catch(o){d.warn("SETTINGS","Failed to persist resolved user_label back to settings.json (continuing in-memory)",{path:e},o instanceof Error?o:new Error(String(o)))}return k=n,k}function Ye(r){if(Es.test(r))return r;let e=r.replace(/[^A-Za-z0-9._-]+/g,"-").replace(/^-+|-+$/g,"");return e.length>0?e:"unknown"}function ls(r,e){try{if(!(0,L.existsSync)(r))return;let t=(0,L.readFileSync)(r,"utf-8"),s=JSON.parse(t),o=(s&&typeof s=="object"&&s.env&&typeof s.env=="object"?s.env:s)?.[e];return typeof o=="string"?o:void 0}catch(t){d.debug("SETTINGS","Failed to read user_label from settings.json (treating as missing)",{settingsPath:r},t instanceof Error?t:new Error(String(t)));return}}function cs(r,e){let t={};if((0,L.existsSync)(r))try{t=JSON.parse((0,L.readFileSync)(r,"utf-8"))}catch{t={}}let s=t.env&&typeof t.env=="object"?t.env:t;if(s.CLAUDE_MEM_USER_LABEL===e)return;s.CLAUDE_MEM_USER_LABEL=e;let n=(0,j.dirname)(r),o=`.user-label.${process.pid}.${(0,qe.randomBytes)(6).toString("hex")}.tmp`,i=(0,L.existsSync)(n)?(0,j.join)(n,o):(0,j.join)((0,Ve.tmpdir)(),o);(0,L.writeFileSync)(i,JSON.stringify(t,null,2),"utf-8"),(0,L.renameSync)(i,r)}function Ke(r,e,t,s){let n=Date.now()-s;return r.prepare(`
    SELECT
      up.*,
      s.memory_session_id,
      s.project,
      COALESCE(s.platform_source, '${A}') as platform_source
    FROM user_prompts up
    JOIN sdk_sessions s ON up.content_session_id = s.content_session_id
    WHERE up.content_session_id = ?
      AND up.prompt_text = ?
      AND up.created_at_epoch >= ?
    ORDER BY up.created_at_epoch DESC
    LIMIT 1
  `).get(e,t,n)??void 0}function ms(r,e){return{customTitle:r,platformSource:e?x(e):void 0}}function Je(){let r=process.env.CLAUDE_MEM_NODE_ROLE;if(r&&r.trim())return r.trim().toLowerCase()==="server";try{if((0,Z.existsSync)(_e)){let e=JSON.parse((0,Z.readFileSync)(_e,"utf-8")),t=e?.env??e??{};return(typeof t.CLAUDE_MEM_NODE_ROLE=="string"?t.CLAUDE_MEM_NODE_ROLE.trim().toLowerCase():"")==="server"}}catch{}return!1}var z=class{db;constructor(e=Ue){e instanceof me.Database?(this.db=e,this.db.run("PRAGMA foreign_keys = ON")):(e!==":memory:"&&ke(O),this.db=new me.Database(e),this.db.run("PRAGMA journal_mode = WAL"),this.db.run("PRAGMA synchronous = NORMAL"),this.db.run("PRAGMA foreign_keys = ON"),this.db.run("PRAGMA journal_size_limit = 4194304")),this.initializeSchema(),this.ensureWorkerPortColumn(),this.ensurePromptTrackingColumns(),this.removeSessionSummariesUniqueConstraint(),this.addObservationHierarchicalFields(),this.makeObservationsTextNullable(),this.createUserPromptsTable(),this.ensureDiscoveryTokensColumn(),this.createPendingMessagesTable(),this.renameSessionIdColumns(),this.repairSessionIdColumnRename(),this.addFailedAtEpochColumn(),this.addOnUpdateCascadeToForeignKeys(),this.addObservationContentHashColumn(),this.addSessionCustomTitleColumn(),this.addSessionPlatformSourceColumn(),this.addObservationModelColumns(),this.ensureMergedIntoProjectColumns(),this.addObservationSubagentColumns(),this.addObservationsUniqueContentHashIndex(),this.addObservationsMetadataColumn(),this.dropDeadPendingMessagesColumns(),this.ensurePendingMessagesToolUseIdColumn(),this.dropWorkerPidColumn(),this.addSessionUserNameColumn(),this.addSessionUserLabelColumn(),this.createSyncInboxTable(),this.addApiKeysUserLabelColumn(),this.ensureUserLabelColumns(),this.ensurePromptCompletedAtColumn(),this.ensureThinkTimeColumn(),this.ensureWeeklyReportsTable(),this.ensureDailyReportsTable()}addApiKeysUserLabelColumn(){if(!Je()||this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(38)||!this.db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='api_keys'").get())return;this.db.query("PRAGMA table_info(api_keys)").all().some(o=>o.name==="bound_user_label")||(this.db.run("ALTER TABLE api_keys ADD COLUMN bound_user_label TEXT"),this.db.run("CREATE INDEX IF NOT EXISTS idx_api_keys_bound_user ON api_keys(bound_user_label)"),d.debug("DB","Added bound_user_label column + idx_api_keys_bound_user to api_keys")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(38,new Date().toISOString())}ensureUserLabelColumns(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(39))return;this.db.query("PRAGMA table_info(observations)").all().some(_=>_.name==="user_label")||this.db.run("ALTER TABLE observations ADD COLUMN user_label TEXT NOT NULL DEFAULT ''"),this.db.query("PRAGMA table_info(session_summaries)").all().some(_=>_.name==="user_label")||this.db.run("ALTER TABLE session_summaries ADD COLUMN user_label TEXT NOT NULL DEFAULT ''"),this.db.run("CREATE INDEX IF NOT EXISTS idx_observations_user_label ON observations(user_label)"),this.db.run("CREATE INDEX IF NOT EXISTS idx_summaries_user_label ON session_summaries(user_label)");let n=this.db.prepare(`
      UPDATE observations SET user_label = (
        SELECT COALESCE(NULLIF(s.user_label, ''), 'unknown')
        FROM sdk_sessions s
        WHERE s.memory_session_id = observations.memory_session_id
      )
      WHERE user_label = ''
        AND memory_session_id IN (SELECT memory_session_id FROM sdk_sessions WHERE memory_session_id IS NOT NULL AND user_label IS NOT NULL AND user_label != '')
    `).run();d.debug("DB",`Backfilled observations.user_label from sdk_sessions: ${n.changes} rows`);let o=this.db.prepare(`
      UPDATE observations SET user_label = (
        SELECT s.user_label FROM sdk_sessions s
        WHERE s.project = observations.project
          AND s.user_label IS NOT NULL AND s.user_label != ''
        ORDER BY s.started_at_epoch DESC
        LIMIT 1
      )
      WHERE user_label = ''
        AND project IN (SELECT project FROM sdk_sessions)
    `).run();d.debug("DB",`Backfilled orphan observations.user_label by project: ${o.changes} rows`);let i=this.db.prepare(`
      UPDATE session_summaries SET user_label = (
        SELECT COALESCE(NULLIF(s.user_label, ''), 'unknown')
        FROM sdk_sessions s
        WHERE s.memory_session_id = session_summaries.memory_session_id
      )
      WHERE user_label = ''
        AND memory_session_id IN (SELECT memory_session_id FROM sdk_sessions WHERE memory_session_id IS NOT NULL AND user_label IS NOT NULL AND user_label != '')
    `).run();d.debug("DB",`Backfilled session_summaries.user_label from sdk_sessions: ${i.changes} rows`);let a=this.db.prepare(`
      UPDATE session_summaries SET user_label = (
        SELECT s.user_label FROM sdk_sessions s
        WHERE s.project = session_summaries.project
          AND s.user_label IS NOT NULL AND s.user_label != ''
        ORDER BY s.started_at_epoch DESC
        LIMIT 1
      )
      WHERE user_label = ''
        AND project IN (SELECT project FROM sdk_sessions)
    `).run();d.debug("DB",`Backfilled orphan session_summaries.user_label by project: ${a.changes} rows`),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(39,new Date().toISOString())}ensurePromptCompletedAtColumn(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(40))return;this.db.query("PRAGMA table_info(user_prompts)").all().some(p=>p.name==="completed_at_epoch")||this.db.run("ALTER TABLE user_prompts ADD COLUMN completed_at_epoch INTEGER"),this.db.run("CREATE INDEX IF NOT EXISTS idx_user_prompts_completed ON user_prompts(completed_at_epoch)");let s=this.db.prepare(`
      UPDATE user_prompts SET completed_at_epoch = (
        SELECT s.completed_at_epoch FROM sdk_sessions s
        WHERE s.content_session_id = user_prompts.content_session_id
          AND s.status = 'completed' AND s.completed_at_epoch IS NOT NULL
      )
      WHERE completed_at_epoch IS NULL
        AND prompt_number = (
          SELECT MAX(prompt_number) FROM user_prompts up2
          WHERE up2.content_session_id = user_prompts.content_session_id
        )
    `).run();d.debug("DB",`Backfill A (last prompt \u2192 session completed_at): ${s.changes} rows`);let n=this.db.prepare(`
      SELECT (up2.created_at_epoch - up.created_at_epoch) AS interval_ms
      FROM user_prompts up
      JOIN user_prompts up2 ON up2.content_session_id = up.content_session_id
        AND up2.prompt_number = up.prompt_number + 1
      WHERE up.completed_at_epoch IS NULL
      ORDER BY interval_ms
    `).all(),o=9e5;if(n.length>=5){let p=n.map(l=>l.interval_ms).filter(l=>l>0),E=Math.floor(p.length*.2),c=Math.ceil(p.length*.8),m=p.slice(E,c);m.length>0&&(o=Math.round(m.reduce((l,T)=>l+T,0)/m.length))}let i=this.db.prepare(`
      UPDATE user_prompts SET completed_at_epoch = (
        SELECT MIN(up2.created_at_epoch, up1.created_at_epoch + ?)
        FROM user_prompts up1
        JOIN user_prompts up2 ON up2.content_session_id = up1.content_session_id
          AND up2.prompt_number = up1.prompt_number + 1
        WHERE up1.id = user_prompts.id
      )
      WHERE completed_at_epoch IS NULL
    `).run(o);d.debug("DB",`Backfill C (LEAD capped at global trimmed mean ${Math.round(o/1e3)}s): ${i.changes} rows`);let a=this.db.prepare(`
      UPDATE user_prompts SET completed_at_epoch = created_at_epoch + 300000
      WHERE completed_at_epoch IS NULL
    `).run();a.changes>0&&d.debug("DB",`Backfill D (default 5min): ${a.changes} rows`);let _=this.db.prepare(`
      UPDATE user_prompts SET completed_at_epoch = created_at_epoch + 300000
      WHERE completed_at_epoch < created_at_epoch
    `).run();_.changes>0&&d.warn("DB",`Fixed ${_.changes} prompts with completed_at_epoch < created_at_epoch (set to +5min)`),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(40,new Date().toISOString())}ensureThinkTimeColumn(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(41))return;this.db.query("PRAGMA table_info(user_prompts)").all().some(s=>s.name==="think_time_ms")||this.db.run("ALTER TABLE user_prompts ADD COLUMN think_time_ms INTEGER NOT NULL DEFAULT 0"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(41,new Date().toISOString())}ensureWeeklyReportsTable(){this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(42)&&this.db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='weekly_reports'").get()||(this.db.run(`
      CREATE TABLE IF NOT EXISTS weekly_reports (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        user_label          TEXT    NOT NULL,
        week_start          TEXT    NOT NULL,
        week_end            TEXT    NOT NULL,
        markdown            TEXT    NOT NULL,
        stats               TEXT,
        model               TEXT,
        generated_at_epoch  INTEGER NOT NULL
      )
    `),this.db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_reports_user_week ON weekly_reports(user_label, week_start)"),this.db.run("CREATE INDEX IF NOT EXISTS idx_weekly_reports_user_week_desc ON weekly_reports(user_label, week_start DESC)"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(42,new Date().toISOString()))}ensureDailyReportsTable(){this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(43)&&this.db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='daily_reports'").get()||(this.db.run(`
      CREATE TABLE IF NOT EXISTS daily_reports (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        user_label          TEXT    NOT NULL,
        report_date         TEXT    NOT NULL,
        markdown            TEXT    NOT NULL,
        stats               TEXT,
        model               TEXT,
        generated_at_epoch  INTEGER NOT NULL
      )
    `),this.db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_reports_user_date ON daily_reports(user_label, report_date)"),this.db.run("CREATE INDEX IF NOT EXISTS idx_daily_reports_user_date_desc ON daily_reports(user_label, report_date DESC)"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(43,new Date().toISOString()))}createSyncInboxTable(){!Je()||this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(37)&&this.db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_inbox'").get()||(this.db.run(`
      CREATE TABLE IF NOT EXISTS sync_inbox (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        user_label        TEXT    NOT NULL,
        source_table      TEXT    NOT NULL
                          CHECK(source_table IN ('sdk_sessions','observations','session_summaries','user_prompts')),
        source_uid        TEXT    NOT NULL,
        applied_at_epoch  INTEGER NOT NULL,
        applied_row_id    INTEGER,
        UNIQUE(user_label, source_table, source_uid)
      )
    `),this.db.run("CREATE INDEX IF NOT EXISTS idx_sync_inbox_user_time ON sync_inbox(user_label, applied_at_epoch DESC)"),d.debug("DB","Created sync_inbox table + idx_sync_inbox_user_time (server mode)"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(37,new Date().toISOString()))}addSessionUserNameColumn(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(35))return;this.db.query("PRAGMA table_info(sdk_sessions)").all().some(n=>n.name==="user_name")||(this.db.run("ALTER TABLE sdk_sessions ADD COLUMN user_name TEXT"),d.debug("DB","Added user_name column to sdk_sessions table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(35,new Date().toISOString())}addSessionUserLabelColumn(){this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(36)||(this.db.query("PRAGMA table_info(sdk_sessions)").all().some(o=>o.name==="user_label")||(this.db.run("ALTER TABLE sdk_sessions ADD COLUMN user_label TEXT"),this.db.run("CREATE INDEX IF NOT EXISTS idx_sdk_sessions_user ON sdk_sessions(user_label)"),d.debug("DB","Added user_label column + idx_sdk_sessions_user to sdk_sessions")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(36,new Date().toISOString()));let t=this.db.prepare("SELECT COUNT(*) AS n FROM sdk_sessions WHERE COALESCE(user_label, '') = ''").get().n;if(t>0){let s=Q();this.db.prepare("UPDATE sdk_sessions SET user_label = ? WHERE COALESCE(user_label, '') = ''").run(s),d.debug("DB",`Backfilled user_label for ${t} sessions -> "${s}"`)}}dropWorkerPidColumn(){let e=this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(32),s=this.db.query("PRAGMA table_info(pending_messages)").all().some(n=>n.name==="worker_pid");if(!(e&&!s)){if(s)try{this.db.run("DROP INDEX IF EXISTS idx_pending_messages_worker_pid"),this.db.run("ALTER TABLE pending_messages DROP COLUMN worker_pid"),d.debug("DB","Dropped worker_pid column and its index from pending_messages")}catch(n){d.warn("DB","Failed to drop worker_pid column from pending_messages",{},n instanceof Error?n:new Error(String(n)));return}e||this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(32,new Date().toISOString())}}dropDeadPendingMessagesColumns(){let e=this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(31),t=this.db.query("PRAGMA table_info(pending_messages)").all(),s=new Set(t.map(i=>i.name)),o=["retry_count","failed_at_epoch","completed_at_epoch"].filter(i=>s.has(i));if(!(e&&o.length===0)){if(o.length>0){this.db.run("BEGIN TRANSACTION");try{this.db.run("DELETE FROM pending_messages WHERE status NOT IN ('pending', 'processing')");for(let i of o)this.db.run(`ALTER TABLE pending_messages DROP COLUMN ${i}`),d.debug("DB",`Dropped dead column ${i} from pending_messages`);e||this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(31,new Date().toISOString()),this.db.run("COMMIT")}catch(i){this.db.run("ROLLBACK"),d.warn("DB","Failed to drop dead columns from pending_messages",{},i instanceof Error?i:new Error(String(i)));return}return}e||this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(31,new Date().toISOString())}}initializeSchema(){this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_versions (
        id INTEGER PRIMARY KEY,
        version INTEGER UNIQUE NOT NULL,
        applied_at TEXT NOT NULL
      )
    `),this.db.run(`
      CREATE TABLE IF NOT EXISTS sdk_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_session_id TEXT UNIQUE NOT NULL,
        memory_session_id TEXT UNIQUE,
        project TEXT NOT NULL,
        platform_source TEXT NOT NULL DEFAULT 'claude',
        user_prompt TEXT,
        started_at TEXT NOT NULL,
        started_at_epoch INTEGER NOT NULL,
        completed_at TEXT,
        completed_at_epoch INTEGER,
        status TEXT CHECK(status IN ('active', 'completed', 'failed')) NOT NULL DEFAULT 'active'
      );

      CREATE INDEX IF NOT EXISTS idx_sdk_sessions_claude_id ON sdk_sessions(content_session_id);
      CREATE INDEX IF NOT EXISTS idx_sdk_sessions_sdk_id ON sdk_sessions(memory_session_id);
      CREATE INDEX IF NOT EXISTS idx_sdk_sessions_project ON sdk_sessions(project);
      CREATE INDEX IF NOT EXISTS idx_sdk_sessions_status ON sdk_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_sdk_sessions_started ON sdk_sessions(started_at_epoch DESC);

      CREATE TABLE IF NOT EXISTS observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_session_id TEXT NOT NULL,
        project TEXT NOT NULL,
        text TEXT NOT NULL,
        type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id) ON DELETE CASCADE ON UPDATE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_observations_sdk_session ON observations(memory_session_id);
      CREATE INDEX IF NOT EXISTS idx_observations_project ON observations(project);
      CREATE INDEX IF NOT EXISTS idx_observations_type ON observations(type);
      CREATE INDEX IF NOT EXISTS idx_observations_created ON observations(created_at_epoch DESC);

      CREATE TABLE IF NOT EXISTS session_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_session_id TEXT UNIQUE NOT NULL,
        project TEXT NOT NULL,
        request TEXT,
        investigated TEXT,
        learned TEXT,
        completed TEXT,
        next_steps TEXT,
        files_read TEXT,
        files_edited TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id) ON DELETE CASCADE ON UPDATE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_session_summaries_sdk_session ON session_summaries(memory_session_id);
      CREATE INDEX IF NOT EXISTS idx_session_summaries_project ON session_summaries(project);
      CREATE INDEX IF NOT EXISTS idx_session_summaries_created ON session_summaries(created_at_epoch DESC);
    `),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(4,new Date().toISOString())}ensureWorkerPortColumn(){this.db.query("PRAGMA table_info(sdk_sessions)").all().some(s=>s.name==="worker_port")||(this.db.run("ALTER TABLE sdk_sessions ADD COLUMN worker_port INTEGER"),d.debug("DB","Added worker_port column to sdk_sessions table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(5,new Date().toISOString())}ensurePromptTrackingColumns(){this.db.query("PRAGMA table_info(sdk_sessions)").all().some(a=>a.name==="prompt_counter")||(this.db.run("ALTER TABLE sdk_sessions ADD COLUMN prompt_counter INTEGER DEFAULT 0"),d.debug("DB","Added prompt_counter column to sdk_sessions table")),this.db.query("PRAGMA table_info(observations)").all().some(a=>a.name==="prompt_number")||(this.db.run("ALTER TABLE observations ADD COLUMN prompt_number INTEGER"),d.debug("DB","Added prompt_number column to observations table")),this.db.query("PRAGMA table_info(session_summaries)").all().some(a=>a.name==="prompt_number")||(this.db.run("ALTER TABLE session_summaries ADD COLUMN prompt_number INTEGER"),d.debug("DB","Added prompt_number column to session_summaries table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(6,new Date().toISOString())}removeSessionSummariesUniqueConstraint(){if(!this.db.query("PRAGMA index_list(session_summaries)").all().some(s=>s.unique===1&&s.origin!=="pk")){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(7,new Date().toISOString());return}d.debug("DB","Removing UNIQUE constraint from session_summaries.memory_session_id"),this.db.run("BEGIN TRANSACTION"),this.db.run("DROP TABLE IF EXISTS session_summaries_new"),this.db.run(`
      CREATE TABLE session_summaries_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_session_id TEXT NOT NULL,
        project TEXT NOT NULL,
        request TEXT,
        investigated TEXT,
        learned TEXT,
        completed TEXT,
        next_steps TEXT,
        files_read TEXT,
        files_edited TEXT,
        notes TEXT,
        prompt_number INTEGER,
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id) ON DELETE CASCADE
      )
    `),this.db.run(`
      INSERT INTO session_summaries_new
      SELECT id, memory_session_id, project, request, investigated, learned,
             completed, next_steps, files_read, files_edited, notes,
             prompt_number, created_at, created_at_epoch
      FROM session_summaries
    `),this.db.run("DROP TABLE session_summaries"),this.db.run("ALTER TABLE session_summaries_new RENAME TO session_summaries"),this.db.run(`
      CREATE INDEX idx_session_summaries_sdk_session ON session_summaries(memory_session_id);
      CREATE INDEX idx_session_summaries_project ON session_summaries(project);
      CREATE INDEX idx_session_summaries_created ON session_summaries(created_at_epoch DESC);
    `),this.db.run("COMMIT"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(7,new Date().toISOString()),d.debug("DB","Successfully removed UNIQUE constraint from session_summaries.memory_session_id")}addObservationHierarchicalFields(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(8))return;if(this.db.query("PRAGMA table_info(observations)").all().some(n=>n.name==="title")){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(8,new Date().toISOString());return}d.debug("DB","Adding hierarchical fields to observations table"),this.db.run(`
      ALTER TABLE observations ADD COLUMN title TEXT;
      ALTER TABLE observations ADD COLUMN subtitle TEXT;
      ALTER TABLE observations ADD COLUMN facts TEXT;
      ALTER TABLE observations ADD COLUMN narrative TEXT;
      ALTER TABLE observations ADD COLUMN concepts TEXT;
      ALTER TABLE observations ADD COLUMN files_read TEXT;
      ALTER TABLE observations ADD COLUMN files_modified TEXT;
    `),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(8,new Date().toISOString()),d.debug("DB","Successfully added hierarchical fields to observations table")}makeObservationsTextNullable(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(9))return;let s=this.db.query("PRAGMA table_info(observations)").all().find(n=>n.name==="text");if(!s||s.notnull===0){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(9,new Date().toISOString());return}d.debug("DB","Making observations.text nullable"),this.db.run("BEGIN TRANSACTION"),this.db.run("DROP TABLE IF EXISTS observations_new"),this.db.run(`
      CREATE TABLE observations_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_session_id TEXT NOT NULL,
        project TEXT NOT NULL,
        text TEXT,
        type TEXT NOT NULL,
        title TEXT,
        subtitle TEXT,
        facts TEXT,
        narrative TEXT,
        concepts TEXT,
        files_read TEXT,
        files_modified TEXT,
        prompt_number INTEGER,
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id) ON DELETE CASCADE
      )
    `),this.db.run(`
      INSERT INTO observations_new
      SELECT id, memory_session_id, project, text, type, title, subtitle, facts,
             narrative, concepts, files_read, files_modified, prompt_number,
             created_at, created_at_epoch
      FROM observations
    `),this.db.run("DROP TABLE observations"),this.db.run("ALTER TABLE observations_new RENAME TO observations"),this.db.run(`
      CREATE INDEX idx_observations_sdk_session ON observations(memory_session_id);
      CREATE INDEX idx_observations_project ON observations(project);
      CREATE INDEX idx_observations_type ON observations(type);
      CREATE INDEX idx_observations_created ON observations(created_at_epoch DESC);
    `),this.db.run("COMMIT"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(9,new Date().toISOString()),d.debug("DB","Successfully made observations.text nullable")}createUserPromptsTable(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(10))return;if(this.db.query("PRAGMA table_info(user_prompts)").all().length>0){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(10,new Date().toISOString());return}d.debug("DB","Creating user_prompts table with FTS5 support"),this.db.run("BEGIN TRANSACTION"),this.db.run(`
      CREATE TABLE user_prompts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_session_id TEXT NOT NULL,
        prompt_number INTEGER NOT NULL,
        prompt_text TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        FOREIGN KEY(content_session_id) REFERENCES sdk_sessions(content_session_id) ON DELETE CASCADE
      );

      CREATE INDEX idx_user_prompts_claude_session ON user_prompts(content_session_id);
      CREATE INDEX idx_user_prompts_created ON user_prompts(created_at_epoch DESC);
      CREATE INDEX idx_user_prompts_prompt_number ON user_prompts(prompt_number);
      CREATE INDEX idx_user_prompts_lookup ON user_prompts(content_session_id, prompt_number);
    `);let s=`
      CREATE VIRTUAL TABLE user_prompts_fts USING fts5(
        prompt_text,
        content='user_prompts',
        content_rowid='id'
      );
    `,n=`
      CREATE TRIGGER user_prompts_ai AFTER INSERT ON user_prompts BEGIN
        INSERT INTO user_prompts_fts(rowid, prompt_text)
        VALUES (new.id, new.prompt_text);
      END;

      CREATE TRIGGER user_prompts_ad AFTER DELETE ON user_prompts BEGIN
        INSERT INTO user_prompts_fts(user_prompts_fts, rowid, prompt_text)
        VALUES('delete', old.id, old.prompt_text);
      END;

      CREATE TRIGGER user_prompts_au AFTER UPDATE ON user_prompts BEGIN
        INSERT INTO user_prompts_fts(user_prompts_fts, rowid, prompt_text)
        VALUES('delete', old.id, old.prompt_text);
        INSERT INTO user_prompts_fts(rowid, prompt_text)
        VALUES (new.id, new.prompt_text);
      END;
    `;try{this.db.run(s),this.db.run(n)}catch(o){o instanceof Error?d.warn("DB","FTS5 not available \u2014 user_prompts_fts skipped (search uses ChromaDB)",{},o):d.warn("DB","FTS5 not available \u2014 user_prompts_fts skipped (search uses ChromaDB)",{},new Error(String(o))),this.db.run("COMMIT"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(10,new Date().toISOString()),d.debug("DB","Created user_prompts table (without FTS5)");return}this.db.run("COMMIT"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(10,new Date().toISOString()),d.debug("DB","Successfully created user_prompts table")}ensureDiscoveryTokensColumn(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(11))return;this.db.query("PRAGMA table_info(observations)").all().some(i=>i.name==="discovery_tokens")||(this.db.run("ALTER TABLE observations ADD COLUMN discovery_tokens INTEGER DEFAULT 0"),d.debug("DB","Added discovery_tokens column to observations table")),this.db.query("PRAGMA table_info(session_summaries)").all().some(i=>i.name==="discovery_tokens")||(this.db.run("ALTER TABLE session_summaries ADD COLUMN discovery_tokens INTEGER DEFAULT 0"),d.debug("DB","Added discovery_tokens column to session_summaries table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(11,new Date().toISOString())}createPendingMessagesTable(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(16))return;if(this.db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='pending_messages'").all().length>0){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(16,new Date().toISOString());return}d.debug("DB","Creating pending_messages table"),this.db.run(`
      CREATE TABLE pending_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_db_id INTEGER NOT NULL,
        content_session_id TEXT NOT NULL,
        message_type TEXT NOT NULL CHECK(message_type IN ('observation', 'summarize')),
        tool_name TEXT,
        tool_input TEXT,
        tool_response TEXT,
        cwd TEXT,
        last_user_message TEXT,
        last_assistant_message TEXT,
        prompt_number INTEGER,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing')),
        created_at_epoch INTEGER NOT NULL,
        FOREIGN KEY (session_db_id) REFERENCES sdk_sessions(id) ON DELETE CASCADE
      )
    `),this.db.run("CREATE INDEX IF NOT EXISTS idx_pending_messages_session ON pending_messages(session_db_id)"),this.db.run("CREATE INDEX IF NOT EXISTS idx_pending_messages_status ON pending_messages(status)"),this.db.run("CREATE INDEX IF NOT EXISTS idx_pending_messages_claude_session ON pending_messages(content_session_id)"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(16,new Date().toISOString()),d.debug("DB","pending_messages table created successfully")}renameSessionIdColumns(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(17))return;d.debug("DB","Checking session ID columns for semantic clarity rename");let t=0,s=(n,o,i)=>{let a=this.db.query(`PRAGMA table_info(${n})`).all(),_=a.some(E=>E.name===o);return a.some(E=>E.name===i)?!1:_?(this.db.run(`ALTER TABLE ${n} RENAME COLUMN ${o} TO ${i}`),d.debug("DB",`Renamed ${n}.${o} to ${i}`),!0):(d.warn("DB",`Column ${o} not found in ${n}, skipping rename`),!1)};s("sdk_sessions","claude_session_id","content_session_id")&&t++,s("sdk_sessions","sdk_session_id","memory_session_id")&&t++,s("pending_messages","claude_session_id","content_session_id")&&t++,s("observations","sdk_session_id","memory_session_id")&&t++,s("session_summaries","sdk_session_id","memory_session_id")&&t++,s("user_prompts","claude_session_id","content_session_id")&&t++,this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(17,new Date().toISOString()),t>0?d.debug("DB",`Successfully renamed ${t} session ID columns`):d.debug("DB","No session ID column renames needed (already up to date)")}repairSessionIdColumnRename(){this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(19)||this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(19,new Date().toISOString())}addFailedAtEpochColumn(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(20))return;this.db.query("PRAGMA table_info(pending_messages)").all().some(n=>n.name==="failed_at_epoch")||(this.db.run("ALTER TABLE pending_messages ADD COLUMN failed_at_epoch INTEGER"),d.debug("DB","Added failed_at_epoch column to pending_messages table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(20,new Date().toISOString())}addOnUpdateCascadeToForeignKeys(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(21))return;d.debug("DB","Adding ON UPDATE CASCADE to FK constraints on observations and session_summaries"),this.db.run("PRAGMA foreign_keys = OFF"),this.db.run("BEGIN TRANSACTION"),this.db.run("DROP TRIGGER IF EXISTS observations_ai"),this.db.run("DROP TRIGGER IF EXISTS observations_ad"),this.db.run("DROP TRIGGER IF EXISTS observations_au"),this.db.run("DROP TABLE IF EXISTS observations_new");let s=this.db.query("PRAGMA table_info(observations)").all().some(T=>T.name==="metadata"),n=s?`,
        metadata TEXT`:"",o=s?", metadata":"",i=`
      CREATE TABLE observations_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_session_id TEXT NOT NULL,
        project TEXT NOT NULL,
        text TEXT,
        type TEXT NOT NULL,
        title TEXT,
        subtitle TEXT,
        facts TEXT,
        narrative TEXT,
        concepts TEXT,
        files_read TEXT,
        files_modified TEXT,
        prompt_number INTEGER,
        discovery_tokens INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL${n},
        FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id) ON DELETE CASCADE ON UPDATE CASCADE
      )
    `,a=`
      INSERT INTO observations_new
      SELECT id, memory_session_id, project, text, type, title, subtitle, facts,
             narrative, concepts, files_read, files_modified, prompt_number,
             discovery_tokens, created_at, created_at_epoch${o}
      FROM observations
    `,_=`
      CREATE INDEX idx_observations_sdk_session ON observations(memory_session_id);
      CREATE INDEX idx_observations_project ON observations(project);
      CREATE INDEX idx_observations_type ON observations(type);
      CREATE INDEX idx_observations_created ON observations(created_at_epoch DESC);
    `,p=`
      CREATE TRIGGER IF NOT EXISTS observations_ai AFTER INSERT ON observations BEGIN
        INSERT INTO observations_fts(rowid, title, subtitle, narrative, text, facts, concepts)
        VALUES (new.id, new.title, new.subtitle, new.narrative, new.text, new.facts, new.concepts);
      END;

      CREATE TRIGGER IF NOT EXISTS observations_ad AFTER DELETE ON observations BEGIN
        INSERT INTO observations_fts(observations_fts, rowid, title, subtitle, narrative, text, facts, concepts)
        VALUES('delete', old.id, old.title, old.subtitle, old.narrative, old.text, old.facts, old.concepts);
      END;

      CREATE TRIGGER IF NOT EXISTS observations_au AFTER UPDATE ON observations BEGIN
        INSERT INTO observations_fts(observations_fts, rowid, title, subtitle, narrative, text, facts, concepts)
        VALUES('delete', old.id, old.title, old.subtitle, old.narrative, old.text, old.facts, old.concepts);
        INSERT INTO observations_fts(rowid, title, subtitle, narrative, text, facts, concepts)
        VALUES (new.id, new.title, new.subtitle, new.narrative, new.text, new.facts, new.concepts);
      END;
    `;this.db.run("DROP TRIGGER IF EXISTS session_summaries_ai"),this.db.run("DROP TRIGGER IF EXISTS session_summaries_ad"),this.db.run("DROP TRIGGER IF EXISTS session_summaries_au"),this.db.run("DROP TABLE IF EXISTS session_summaries_new");let E=`
      CREATE TABLE session_summaries_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_session_id TEXT NOT NULL,
        project TEXT NOT NULL,
        request TEXT,
        investigated TEXT,
        learned TEXT,
        completed TEXT,
        next_steps TEXT,
        files_read TEXT,
        files_edited TEXT,
        notes TEXT,
        prompt_number INTEGER,
        discovery_tokens INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id) ON DELETE CASCADE ON UPDATE CASCADE
      )
    `,c=`
      INSERT INTO session_summaries_new
      SELECT id, memory_session_id, project, request, investigated, learned,
             completed, next_steps, files_read, files_edited, notes,
             prompt_number, discovery_tokens, created_at, created_at_epoch
      FROM session_summaries
    `,m=`
      CREATE INDEX idx_session_summaries_sdk_session ON session_summaries(memory_session_id);
      CREATE INDEX idx_session_summaries_project ON session_summaries(project);
      CREATE INDEX idx_session_summaries_created ON session_summaries(created_at_epoch DESC);
    `,l=`
      CREATE TRIGGER IF NOT EXISTS session_summaries_ai AFTER INSERT ON session_summaries BEGIN
        INSERT INTO session_summaries_fts(rowid, request, investigated, learned, completed, next_steps, notes)
        VALUES (new.id, new.request, new.investigated, new.learned, new.completed, new.next_steps, new.notes);
      END;

      CREATE TRIGGER IF NOT EXISTS session_summaries_ad AFTER DELETE ON session_summaries BEGIN
        INSERT INTO session_summaries_fts(session_summaries_fts, rowid, request, investigated, learned, completed, next_steps, notes)
        VALUES('delete', old.id, old.request, old.investigated, old.learned, old.completed, old.next_steps, old.notes);
      END;

      CREATE TRIGGER IF NOT EXISTS session_summaries_au AFTER UPDATE ON session_summaries BEGIN
        INSERT INTO session_summaries_fts(session_summaries_fts, rowid, request, investigated, learned, completed, next_steps, notes)
        VALUES('delete', old.id, old.request, old.investigated, old.learned, old.completed, old.next_steps, old.notes);
        INSERT INTO session_summaries_fts(rowid, request, investigated, learned, completed, next_steps, notes)
        VALUES (new.id, new.request, new.investigated, new.learned, new.completed, new.next_steps, new.notes);
      END;
    `;try{this.recreateObservationsWithCascade(i,a,_,p),this.recreateSessionSummariesWithCascade(E,c,m,l),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(21,new Date().toISOString()),this.db.run("COMMIT"),this.db.run("PRAGMA foreign_keys = ON"),d.debug("DB","Successfully added ON UPDATE CASCADE to FK constraints")}catch(T){throw this.db.run("ROLLBACK"),this.db.run("PRAGMA foreign_keys = ON"),T instanceof Error?T:new Error(String(T))}}recreateObservationsWithCascade(e,t,s,n){this.db.run(e),this.db.run(t),this.db.run("DROP TABLE observations"),this.db.run("ALTER TABLE observations_new RENAME TO observations"),this.db.run(s),this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='observations_fts'").all().length>0&&this.db.run(n)}recreateSessionSummariesWithCascade(e,t,s,n){this.db.run(e),this.db.run(t),this.db.run("DROP TABLE session_summaries"),this.db.run("ALTER TABLE session_summaries_new RENAME TO session_summaries"),this.db.run(s),this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='session_summaries_fts'").all().length>0&&this.db.run(n)}addObservationContentHashColumn(){if(this.db.query("PRAGMA table_info(observations)").all().some(s=>s.name==="content_hash")){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(22,new Date().toISOString());return}this.db.run("ALTER TABLE observations ADD COLUMN content_hash TEXT"),this.db.run("UPDATE observations SET content_hash = substr(hex(randomblob(8)), 1, 16) WHERE content_hash IS NULL"),this.db.run("CREATE INDEX IF NOT EXISTS idx_observations_content_hash ON observations(content_hash, created_at_epoch)"),d.debug("DB","Added content_hash column to observations table with backfill and index"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(22,new Date().toISOString())}addSessionCustomTitleColumn(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(23))return;this.db.query("PRAGMA table_info(sdk_sessions)").all().some(n=>n.name==="custom_title")||(this.db.run("ALTER TABLE sdk_sessions ADD COLUMN custom_title TEXT"),d.debug("DB","Added custom_title column to sdk_sessions table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(23,new Date().toISOString())}addSessionPlatformSourceColumn(){let t=this.db.query("PRAGMA table_info(sdk_sessions)").all().some(i=>i.name==="platform_source"),n=this.db.query("PRAGMA index_list(sdk_sessions)").all().some(i=>i.name==="idx_sdk_sessions_platform_source");this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(24)&&t&&n||(t||(this.db.run(`ALTER TABLE sdk_sessions ADD COLUMN platform_source TEXT NOT NULL DEFAULT '${A}'`),d.debug("DB","Added platform_source column to sdk_sessions table")),this.db.run(`
      UPDATE sdk_sessions
      SET platform_source = '${A}'
      WHERE platform_source IS NULL OR platform_source = ''
    `),n||this.db.run("CREATE INDEX IF NOT EXISTS idx_sdk_sessions_platform_source ON sdk_sessions(platform_source)"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(24,new Date().toISOString()))}addObservationModelColumns(){let e=this.db.query("PRAGMA table_info(observations)").all(),t=e.some(n=>n.name==="generated_by_model"),s=e.some(n=>n.name==="relevance_count");t&&s||(t||this.db.run("ALTER TABLE observations ADD COLUMN generated_by_model TEXT"),s||this.db.run("ALTER TABLE observations ADD COLUMN relevance_count INTEGER DEFAULT 0"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(26,new Date().toISOString()))}ensureMergedIntoProjectColumns(){this.db.query("PRAGMA table_info(observations)").all().some(s=>s.name==="merged_into_project")||this.db.run("ALTER TABLE observations ADD COLUMN merged_into_project TEXT"),this.db.run("CREATE INDEX IF NOT EXISTS idx_observations_merged_into ON observations(merged_into_project)"),this.db.query("PRAGMA table_info(session_summaries)").all().some(s=>s.name==="merged_into_project")||this.db.run("ALTER TABLE session_summaries ADD COLUMN merged_into_project TEXT"),this.db.run("CREATE INDEX IF NOT EXISTS idx_summaries_merged_into ON session_summaries(merged_into_project)")}addObservationSubagentColumns(){let e=this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(27),t=this.db.query("PRAGMA table_info(observations)").all(),s=t.some(i=>i.name==="agent_type"),n=t.some(i=>i.name==="agent_id");s||this.db.run("ALTER TABLE observations ADD COLUMN agent_type TEXT"),n||this.db.run("ALTER TABLE observations ADD COLUMN agent_id TEXT"),this.db.run("CREATE INDEX IF NOT EXISTS idx_observations_agent_type ON observations(agent_type)"),this.db.run("CREATE INDEX IF NOT EXISTS idx_observations_agent_id ON observations(agent_id)");let o=this.db.query("PRAGMA table_info(pending_messages)").all();if(o.length>0){let i=o.some(_=>_.name==="agent_type"),a=o.some(_=>_.name==="agent_id");i||this.db.run("ALTER TABLE pending_messages ADD COLUMN agent_type TEXT"),a||this.db.run("ALTER TABLE pending_messages ADD COLUMN agent_id TEXT")}e||this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(27,new Date().toISOString())}ensurePendingMessagesToolUseIdColumn(){if(this.db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='pending_messages'").all().length===0){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(28,new Date().toISOString());return}this.db.query("PRAGMA table_info(pending_messages)").all().some(n=>n.name==="tool_use_id")||this.db.run("ALTER TABLE pending_messages ADD COLUMN tool_use_id TEXT"),this.db.run("BEGIN TRANSACTION");try{this.db.run(`
        DELETE FROM pending_messages
         WHERE id IN (
           SELECT id
             FROM (
               SELECT id,
                      ROW_NUMBER() OVER (
                        PARTITION BY content_session_id, tool_use_id
                        ORDER BY CASE status
                          WHEN 'processing' THEN 0
                          WHEN 'pending' THEN 1
                          ELSE 2
                        END, id
                      ) AS duplicate_rank
                 FROM pending_messages
                WHERE tool_use_id IS NOT NULL
             )
            WHERE duplicate_rank > 1
           )
      `),this.db.run(`
        -- tool_use_id is optional for summaries and legacy rows; enforce de-dupe
        -- only for rows that came from a concrete tool-use event.
        CREATE UNIQUE INDEX IF NOT EXISTS ux_pending_session_tool
        ON pending_messages(content_session_id, tool_use_id)
        WHERE tool_use_id IS NOT NULL
      `),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(28,new Date().toISOString()),this.db.run("COMMIT")}catch(n){throw this.db.run("ROLLBACK"),n}}addObservationsUniqueContentHashIndex(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(29))return;let t=this.db.query("PRAGMA table_info(observations)").all(),s=t.some(o=>o.name==="memory_session_id"),n=t.some(o=>o.name==="content_hash");if(!s||!n){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(29,new Date().toISOString());return}this.db.run("BEGIN TRANSACTION");try{this.db.run(`
        DELETE FROM observations
         WHERE id NOT IN (
           SELECT MIN(id) FROM observations
            GROUP BY memory_session_id, content_hash
         )
      `),this.db.run(`
        CREATE UNIQUE INDEX IF NOT EXISTS ux_observations_session_hash
        ON observations(memory_session_id, content_hash)
      `),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(29,new Date().toISOString()),this.db.run("COMMIT")}catch(o){throw this.db.run("ROLLBACK"),o}}addObservationsMetadataColumn(){this.db.query("PRAGMA table_info(observations)").all().some(s=>s.name==="metadata")||(this.db.run("ALTER TABLE observations ADD COLUMN metadata TEXT"),d.debug("DB","Added metadata column to observations table (#2116)")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(30,new Date().toISOString())}updateMemorySessionId(e,t){this.db.prepare(`
      UPDATE sdk_sessions
      SET memory_session_id = ?
      WHERE id = ?
    `).run(t,e)}markSessionCompleted(e){let t=Date.now(),s=new Date(t).toISOString();this.db.prepare(`
      UPDATE sdk_sessions
      SET status = 'completed', completed_at = ?, completed_at_epoch = ?
      WHERE id = ?
    `).run(s,t,e)}ensureMemorySessionIdRegistered(e,t){let s=this.db.prepare(`
      SELECT id, memory_session_id FROM sdk_sessions WHERE id = ?
    `).get(e);if(!s)throw new Error(`Session ${e} not found in sdk_sessions`);s.memory_session_id!==t&&(this.db.prepare(`
        UPDATE sdk_sessions SET memory_session_id = ? WHERE id = ?
      `).run(t,e),d.info("DB","Registered memory_session_id before storage (FK fix)",{sessionDbId:e,oldId:s.memory_session_id,newId:t}))}getRecentSummaries(e,t=10){return this.db.prepare(`
      SELECT
        request, investigated, learned, completed, next_steps,
        files_read, files_edited, notes, prompt_number, created_at
      FROM session_summaries
      WHERE project = ?
      ORDER BY created_at_epoch DESC
      LIMIT ?
    `).all(e,t)}getRecentSummariesWithSessionInfo(e,t=3){return this.db.prepare(`
      SELECT
        memory_session_id, request, learned, completed, next_steps,
        prompt_number, created_at
      FROM session_summaries
      WHERE project = ?
      ORDER BY created_at_epoch DESC
      LIMIT ?
    `).all(e,t)}getRecentObservations(e,t=20){return this.db.prepare(`
      SELECT type, text, prompt_number, created_at
      FROM observations
      WHERE project = ?
      ORDER BY created_at_epoch DESC
      LIMIT ?
    `).all(e,t)}getAllRecentObservations(e=100){return this.db.prepare(`
      SELECT
        o.id,
        o.type,
        o.title,
        o.subtitle,
        o.text,
        o.project,
        COALESCE(s.platform_source, '${A}') as platform_source,
        o.prompt_number,
        o.created_at,
        o.created_at_epoch
      FROM observations o
      LEFT JOIN sdk_sessions s ON o.memory_session_id = s.memory_session_id
      ORDER BY o.created_at_epoch DESC
      LIMIT ?
    `).all(e)}getAllRecentSummaries(e=50){return this.db.prepare(`
      SELECT
        ss.id,
        ss.request,
        ss.investigated,
        ss.learned,
        ss.completed,
        ss.next_steps,
        ss.files_read,
        ss.files_edited,
        ss.notes,
        ss.project,
        COALESCE(s.platform_source, '${A}') as platform_source,
        ss.prompt_number,
        ss.created_at,
        ss.created_at_epoch
      FROM session_summaries ss
      LEFT JOIN sdk_sessions s ON ss.memory_session_id = s.memory_session_id
      ORDER BY ss.created_at_epoch DESC
      LIMIT ?
    `).all(e)}getAllRecentUserPrompts(e=100){return this.db.prepare(`
      SELECT
        up.id,
        up.content_session_id,
        s.project,
        COALESCE(s.platform_source, '${A}') as platform_source,
        up.prompt_number,
        up.prompt_text,
        up.created_at,
        up.created_at_epoch
      FROM user_prompts up
      LEFT JOIN sdk_sessions s ON up.content_session_id = s.content_session_id
      ORDER BY up.created_at_epoch DESC
      LIMIT ?
    `).all(e)}getAllProjects(e){let t=e?x(e):void 0,s=`
      SELECT DISTINCT project
      FROM sdk_sessions
      WHERE project IS NOT NULL AND project != ''
        AND project != ?
    `,n=[de];return t&&(s+=" AND COALESCE(platform_source, ?) = ?",n.push(A,t)),s+=" ORDER BY project ASC",this.db.prepare(s).all(...n).map(i=>i.project)}getProjectCatalog(){let e=this.db.prepare(`
      SELECT
        COALESCE(platform_source, '${A}') as platform_source,
        project,
        user_label,
        started_at_epoch
      FROM sdk_sessions
      WHERE project IS NOT NULL AND project != ''
        AND project != ?
      ORDER BY started_at_epoch DESC
    `).all(de),t=[],s=new Set,n={},o={};for(let a of e){let _=x(a.platform_source);if(n[_]||(n[_]=[]),n[_].includes(a.project)||n[_].push(a.project),!s.has(a.project)){s.add(a.project),t.push(a.project);let p=a.user_label?.trim();o[a.project]=p||null}}let i=Be(Object.keys(n));return{projects:t,sources:i,projectsBySource:Object.fromEntries(i.map(a=>[a,n[a]||[]])),projectUsers:o}}getLatestUserPrompt(e){return this.db.prepare(`
      SELECT
        up.*,
        s.memory_session_id,
        s.project,
        COALESCE(s.platform_source, '${A}') as platform_source
      FROM user_prompts up
      JOIN sdk_sessions s ON up.content_session_id = s.content_session_id
      WHERE up.content_session_id = ?
      ORDER BY up.created_at_epoch DESC
      LIMIT 1
    `).get(e)}findRecentDuplicateUserPrompt(e,t,s){return Ke(this.db,e,t,s)}getRecentSessionsWithStatus(e,t=3){return this.db.prepare(`
      SELECT * FROM (
        SELECT
          s.memory_session_id,
          s.status,
          s.started_at,
          s.started_at_epoch,
          s.user_prompt,
          CASE WHEN sum.memory_session_id IS NOT NULL THEN 1 ELSE 0 END as has_summary
        FROM sdk_sessions s
        LEFT JOIN session_summaries sum ON s.memory_session_id = sum.memory_session_id
        WHERE s.project = ? AND s.memory_session_id IS NOT NULL
        GROUP BY s.memory_session_id
        ORDER BY s.started_at_epoch DESC
        LIMIT ?
      )
      ORDER BY started_at_epoch ASC
    `).all(e,t)}getObservationsForSession(e){return this.db.prepare(`
      SELECT title, subtitle, type, prompt_number
      FROM observations
      WHERE memory_session_id = ?
      ORDER BY created_at_epoch ASC
    `).all(e)}getObservationById(e){return this.db.prepare(`
      SELECT *
      FROM observations
      WHERE id = ?
    `).get(e)||null}getObservationsByIds(e,t={}){if(e.length===0)return[];let{orderBy:s="date_desc",limit:n,project:o,type:i,concepts:a,files:_}=t,p=s==="relevance",E=p?"":`ORDER BY created_at_epoch ${s==="date_asc"?"ASC":"DESC"}`,c=n?`LIMIT ${n}`:"",m=e.map(()=>"?").join(","),l=[...e],T=[];if(o&&(T.push("project = ?"),l.push(o)),i)if(Array.isArray(i)){let R=i.map(()=>"?").join(",");T.push(`type IN (${R})`),l.push(...i)}else T.push("type = ?"),l.push(i);if(a){let R=Array.isArray(a)?a:[a],D=R.map(()=>"EXISTS (SELECT 1 FROM json_each(concepts) WHERE value = ?)");l.push(...R),T.push(`(${D.join(" OR ")})`)}if(_){let R=Array.isArray(_)?_:[_],D=R.map(()=>"(EXISTS (SELECT 1 FROM json_each(files_read) WHERE value LIKE ?) OR EXISTS (SELECT 1 FROM json_each(files_modified) WHERE value LIKE ?))");R.forEach(N=>{l.push(`%${N}%`,`%${N}%`)}),T.push(`(${D.join(" OR ")})`)}let b=T.length>0?`WHERE id IN (${m}) AND ${T.join(" AND ")}`:`WHERE id IN (${m})`,h=this.db.prepare(`
      SELECT *
      FROM observations
      ${b}
      ${E}
      ${c}
    `).all(...l);if(!p)return h;let f=new Map(h.map(R=>[R.id,R]));return e.map(R=>f.get(R)).filter(R=>!!R)}getSummaryForSession(e){return this.db.prepare(`
      SELECT
        request, investigated, learned, completed, next_steps,
        files_read, files_edited, notes, prompt_number, created_at,
        created_at_epoch
      FROM session_summaries
      WHERE memory_session_id = ?
      ORDER BY created_at_epoch DESC
      LIMIT 1
    `).get(e)||null}getFilesForSession(e){let s=this.db.prepare(`
      SELECT files_read, files_modified
      FROM observations
      WHERE memory_session_id = ?
    `).all(e),n=new Set,o=new Set;for(let i of s)ce(i.files_read).forEach(a=>n.add(a)),ce(i.files_modified).forEach(a=>o.add(a));return{filesRead:Array.from(n),filesModified:Array.from(o)}}getSessionById(e){return this.db.prepare(`
      SELECT id, content_session_id, memory_session_id, project,
             COALESCE(platform_source, '${A}') as platform_source,
             user_prompt, custom_title, status
      FROM sdk_sessions
      WHERE id = ?
      LIMIT 1
    `).get(e)||null}getSdkSessionsBySessionIds(e){if(e.length===0)return[];let t=e.map(()=>"?").join(",");return this.db.prepare(`
      SELECT id, content_session_id, memory_session_id, project,
             COALESCE(platform_source, '${A}') as platform_source,
             user_prompt, custom_title,
             started_at, started_at_epoch, completed_at, completed_at_epoch, status
      FROM sdk_sessions
      WHERE memory_session_id IN (${t})
      ORDER BY started_at_epoch DESC
    `).all(...e)}getPromptNumberFromUserPrompts(e){return this.db.prepare(`
      SELECT COUNT(*) as count FROM user_prompts WHERE content_session_id = ?
    `).get(e).count}createSDKSession(e,t,s,n,o){let i=new Date,a=i.getTime(),_=ms(n,o),p=_.platformSource??A,E=this.db.prepare(`
      SELECT id, platform_source FROM sdk_sessions WHERE content_session_id = ?
    `).get(e);if(E){if(t&&this.db.prepare(`
          UPDATE sdk_sessions SET project = ?
          WHERE content_session_id = ? AND (project IS NULL OR project = '')
        `).run(t,e),s&&this.db.prepare(`
          UPDATE sdk_sessions SET user_prompt = ?
          WHERE content_session_id = ? AND (user_prompt IS NULL OR user_prompt = '')
        `).run(s,e),_.customTitle&&this.db.prepare(`
          UPDATE sdk_sessions SET custom_title = ?
          WHERE content_session_id = ? AND custom_title IS NULL
        `).run(_.customTitle,e),_.platformSource){let m=E.platform_source?.trim()?x(E.platform_source):void 0;if(!m)this.db.prepare(`
            UPDATE sdk_sessions SET platform_source = ?
            WHERE content_session_id = ?
              AND COALESCE(platform_source, '') = ''
          `).run(_.platformSource,e);else if(m!==_.platformSource)throw new Error(`Platform source conflict for session ${e}: existing=${m}, received=${_.platformSource}`)}return this.db.prepare(`
        UPDATE sdk_sessions SET user_label = ?, user_name = COALESCE(user_name, ?)
        WHERE content_session_id = ?
          AND COALESCE(user_label, '') = ''
      `).run(Q(),H(),e),E.id}return this.db.prepare(`
      INSERT INTO sdk_sessions
      (content_session_id, memory_session_id, project, platform_source, user_prompt, custom_title, started_at, started_at_epoch, status, user_name, user_label)
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(e,t,p,s,_.customTitle||null,i.toISOString(),a,H(),Q()),this.db.prepare("SELECT id FROM sdk_sessions WHERE content_session_id = ?").get(e).id}saveUserPrompt(e,t,s,n,o=0){let i=new Date,a=n??i.getTime();return this.db.prepare(`
      INSERT INTO user_prompts
      (content_session_id, prompt_number, prompt_text, created_at, created_at_epoch, think_time_ms)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(e,t,s,i.toISOString(),a,o).lastInsertRowid}getUserPrompt(e,t){return this.db.prepare(`
      SELECT prompt_text
      FROM user_prompts
      WHERE content_session_id = ? AND prompt_number = ?
      LIMIT 1
    `).get(e,t)?.prompt_text??null}getPromptCompletedAt(e,t){return this.db.prepare(`
      SELECT completed_at_epoch FROM user_prompts
      WHERE content_session_id = ? AND prompt_number = ?
    `).get(e,t)?.completed_at_epoch??null}updatePromptCompletedAt(e,t,s,n="stop_hook"){n==="transcript"?this.db.prepare(`
        UPDATE user_prompts SET completed_at_epoch = ?
        WHERE content_session_id = ? AND prompt_number = ?
      `).run(s,e,t):this.db.prepare(`
        UPDATE user_prompts SET completed_at_epoch = ?
        WHERE content_session_id = ? AND prompt_number = ?
          AND completed_at_epoch IS NULL
      `).run(s,e,t)}getLastObservationEpoch(e){return this.db.prepare(`
      SELECT MAX(o.created_at_epoch) AS last_obs
      FROM observations o
      JOIN sdk_sessions s ON s.memory_session_id = o.memory_session_id
      WHERE s.content_session_id = ?
    `).get(e)?.last_obs??null}getMaxPromptNumber(e){return this.db.prepare(`
      SELECT MAX(prompt_number) AS n FROM user_prompts WHERE content_session_id = ?
    `).get(e)?.n??null}storeObservation(e,t,s,n,o=0,i,a){let _=i??Date.now(),p=new Date(_).toISOString(),E=J(e,s.title,s.narrative),m=this.db.prepare(`
      INSERT INTO observations
      (memory_session_id, project, type, title, subtitle, facts, narrative, concepts,
       files_read, files_modified, prompt_number, discovery_tokens, agent_type, agent_id, content_hash, created_at, created_at_epoch,
       generated_by_model, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(memory_session_id, content_hash) DO NOTHING
      RETURNING id, created_at_epoch
    `).get(e,t,s.type,s.title,s.subtitle,JSON.stringify(s.facts),s.narrative,JSON.stringify(s.concepts),JSON.stringify(s.files_read),JSON.stringify(s.files_modified),n||null,o,s.agent_type??null,s.agent_id??null,E,p,_,a||null,s.metadata??null);if(m)return{id:m.id,createdAtEpoch:m.created_at_epoch};let l=this.db.prepare("SELECT id, created_at_epoch FROM observations WHERE memory_session_id = ? AND content_hash = ?").get(e,E);if(!l)throw new Error(`storeObservation: ON CONFLICT without existing row for content_hash=${E}`);return{id:l.id,createdAtEpoch:l.created_at_epoch}}storeSummary(e,t,s,n,o=0,i){let a=i??Date.now(),_=new Date(a).toISOString(),E=this.db.prepare(`
      INSERT INTO session_summaries
      (memory_session_id, project, request, investigated, learned, completed,
       next_steps, notes, prompt_number, discovery_tokens, created_at, created_at_epoch)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(e,t,s.request,s.investigated,s.learned,s.completed,s.next_steps,s.notes,n||null,o,_,a);return{id:Number(E.lastInsertRowid),createdAtEpoch:a}}storeObservations(e,t,s,n,o,i,a=0,_,p){let E=_??Date.now(),c=new Date(E).toISOString();return this.db.transaction(()=>{let l=[],T=this.db.prepare(`
        INSERT INTO observations
        (memory_session_id, project, type, title, subtitle, facts, narrative, concepts,
         files_read, files_modified, prompt_number, discovery_tokens, agent_type, agent_id, content_hash, created_at, created_at_epoch,
         generated_by_model, user_label)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(memory_session_id, content_hash) DO NOTHING
        RETURNING id
      `),b=this.db.prepare("SELECT id FROM observations WHERE memory_session_id = ? AND content_hash = ?");for(let h of s){let f=J(e,h.title,h.narrative),R=T.get(e,t,h.type,h.title,h.subtitle,JSON.stringify(h.facts),h.narrative,JSON.stringify(h.concepts),JSON.stringify(h.files_read),JSON.stringify(h.files_modified),i||null,a,h.agent_type??null,h.agent_id??null,f,c,E,p||null,o);if(R){l.push(R.id);continue}let D=b.get(e,f);if(!D)throw new Error(`storeObservations: ON CONFLICT without existing row for content_hash=${f}`);l.push(D.id)}let S=null;if(n){let f=this.db.prepare(`
          INSERT INTO session_summaries
          (memory_session_id, project, request, investigated, learned, completed,
           next_steps, notes, prompt_number, discovery_tokens, created_at, created_at_epoch, user_label)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(e,t,n.request,n.investigated,n.learned,n.completed,n.next_steps,n.notes,i||null,a,c,E,o);S=Number(f.lastInsertRowid)}return{observationIds:l,summaryId:S,createdAtEpoch:E}})()}storeObservationsAndMarkComplete(e,t,s,n,o,i,a,_,p=0,E,c){let m=E??Date.now(),l=new Date(m).toISOString();return this.db.transaction(()=>{let b=[],S=this.db.prepare(`
        INSERT INTO observations
        (memory_session_id, project, type, title, subtitle, facts, narrative, concepts,
         files_read, files_modified, prompt_number, discovery_tokens, agent_type, agent_id, content_hash, created_at, created_at_epoch,
         generated_by_model, user_label)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(memory_session_id, content_hash) DO NOTHING
        RETURNING id
      `),h=this.db.prepare("SELECT id FROM observations WHERE memory_session_id = ? AND content_hash = ?");for(let N of s){let F=J(e,N.title,N.narrative),Me=S.get(e,t,N.type,N.title,N.subtitle,JSON.stringify(N.facts),N.narrative,JSON.stringify(N.concepts),JSON.stringify(N.files_read),JSON.stringify(N.files_modified),_||null,p,N.agent_type??null,N.agent_id??null,F,l,m,c||null,a);if(Me){b.push(Me.id);continue}let De=h.get(e,F);if(!De)throw new Error(`storeObservationsAndMarkComplete: ON CONFLICT without existing row for content_hash=${F}`);b.push(De.id)}let f;if(n){let F=this.db.prepare(`
          INSERT INTO session_summaries
          (memory_session_id, project, request, investigated, learned, completed,
           next_steps, notes, prompt_number, discovery_tokens, created_at, created_at_epoch, user_label)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(e,t,n.request,n.investigated,n.learned,n.completed,n.next_steps,n.notes,_||null,p,l,m,a);f=Number(F.lastInsertRowid)}if(this.db.prepare(`
        DELETE FROM pending_messages
        WHERE id = ? AND status = 'processing'
      `).run(o).changes!==1)throw new Error(`storeObservationsAndMarkComplete: failed to complete pending message ${o}`);return{observationIds:b,summaryId:f,createdAtEpoch:m}})()}getSessionSummariesByIds(e,t={}){if(e.length===0)return[];let{orderBy:s="date_desc",limit:n,project:o}=t,i=s==="relevance",a=i?"":`ORDER BY created_at_epoch ${s==="date_asc"?"ASC":"DESC"}`,_=n?`LIMIT ${n}`:"",p=e.map(()=>"?").join(","),E=[...e],c=o?`WHERE id IN (${p}) AND project = ?`:`WHERE id IN (${p})`;o&&E.push(o);let l=this.db.prepare(`
      SELECT * FROM session_summaries
      ${c}
      ${a}
      ${_}
    `).all(...E);if(!i)return l;let T=new Map(l.map(b=>[b.id,b]));return e.map(b=>T.get(b)).filter(b=>!!b)}getUserPromptsByIds(e,t={}){if(e.length===0)return[];let{orderBy:s="date_desc",limit:n,project:o}=t,i=s==="relevance",a=i?"":`ORDER BY up.created_at_epoch ${s==="date_asc"?"ASC":"DESC"}`,_=n?`LIMIT ${n}`:"",p=e.map(()=>"?").join(","),E=[...e],c=o?"AND s.project = ?":"";o&&E.push(o);let l=this.db.prepare(`
      SELECT
        up.*,
        s.project,
        s.memory_session_id
      FROM user_prompts up
      JOIN sdk_sessions s ON up.content_session_id = s.content_session_id
      WHERE up.id IN (${p}) ${c}
      ${a}
      ${_}
    `).all(...E);if(!i)return l;let T=new Map(l.map(b=>[b.id,b]));return e.map(b=>T.get(b)).filter(b=>!!b)}getTimelineAroundTimestamp(e,t=10,s=10,n){return this.getTimelineAroundObservation(null,e,t,s,n)}getTimelineAroundObservation(e,t,s=10,n=10,o){let i=o?"AND project = ?":"",a=o?[o]:[],_,p;if(e!==null){let S=`
        SELECT id, created_at_epoch
        FROM observations
        WHERE id <= ? ${i}
        ORDER BY id DESC
        LIMIT ?
      `,h=`
        SELECT id, created_at_epoch
        FROM observations
        WHERE id >= ? ${i}
        ORDER BY id ASC
        LIMIT ?
      `;try{let f=this.db.prepare(S).all(e,...a,s+1),R=this.db.prepare(h).all(e,...a,n+1);if(f.length===0&&R.length===0)return{observations:[],sessions:[],prompts:[]};_=f.length>0?f[f.length-1].created_at_epoch:t,p=R.length>0?R[R.length-1].created_at_epoch:t}catch(f){return f instanceof Error?d.error("DB","Error getting boundary observations",{project:o},f):d.error("DB","Error getting boundary observations with non-Error",{},new Error(String(f))),{observations:[],sessions:[],prompts:[]}}}else{let S=`
        SELECT created_at_epoch
        FROM observations
        WHERE created_at_epoch <= ? ${i}
        ORDER BY created_at_epoch DESC
        LIMIT ?
      `,h=`
        SELECT created_at_epoch
        FROM observations
        WHERE created_at_epoch >= ? ${i}
        ORDER BY created_at_epoch ASC
        LIMIT ?
      `;try{let f=this.db.prepare(S).all(t,...a,s),R=this.db.prepare(h).all(t,...a,n+1);if(f.length===0&&R.length===0)return{observations:[],sessions:[],prompts:[]};_=f.length>0?f[f.length-1].created_at_epoch:t,p=R.length>0?R[R.length-1].created_at_epoch:t}catch(f){return f instanceof Error?d.error("DB","Error getting boundary timestamps",{project:o},f):d.error("DB","Error getting boundary timestamps with non-Error",{},new Error(String(f))),{observations:[],sessions:[],prompts:[]}}}let E=`
      SELECT *
      FROM observations
      WHERE created_at_epoch >= ? AND created_at_epoch <= ? ${i}
      ORDER BY created_at_epoch ASC
    `,c=`
      SELECT *
      FROM session_summaries
      WHERE created_at_epoch >= ? AND created_at_epoch <= ? ${i}
      ORDER BY created_at_epoch ASC
    `,m=`
      SELECT up.*, s.project, s.memory_session_id
      FROM user_prompts up
      JOIN sdk_sessions s ON up.content_session_id = s.content_session_id
      WHERE up.created_at_epoch >= ? AND up.created_at_epoch <= ? ${i.replace("project","s.project")}
      ORDER BY up.created_at_epoch ASC
    `,l=this.db.prepare(E).all(_,p,...a),T=this.db.prepare(c).all(_,p,...a),b=this.db.prepare(m).all(_,p,...a);return{observations:l,sessions:T.map(S=>({id:S.id,memory_session_id:S.memory_session_id,project:S.project,request:S.request,completed:S.completed,next_steps:S.next_steps,created_at:S.created_at,created_at_epoch:S.created_at_epoch})),prompts:b.map(S=>({id:S.id,content_session_id:S.content_session_id,prompt_number:S.prompt_number,prompt_text:S.prompt_text,project:S.project,created_at:S.created_at,created_at_epoch:S.created_at_epoch}))}}getPromptById(e){return this.db.prepare(`
      SELECT
        p.id,
        p.content_session_id,
        p.prompt_number,
        p.prompt_text,
        s.project,
        p.created_at,
        p.created_at_epoch
      FROM user_prompts p
      LEFT JOIN sdk_sessions s ON p.content_session_id = s.content_session_id
      WHERE p.id = ?
      LIMIT 1
    `).get(e)||null}getPromptsByIds(e){if(e.length===0)return[];let t=e.map(()=>"?").join(",");return this.db.prepare(`
      SELECT
        p.id,
        p.content_session_id,
        p.prompt_number,
        p.prompt_text,
        s.project,
        p.created_at,
        p.created_at_epoch
      FROM user_prompts p
      LEFT JOIN sdk_sessions s ON p.content_session_id = s.content_session_id
      WHERE p.id IN (${t})
      ORDER BY p.created_at_epoch DESC
    `).all(...e)}getSessionSummaryById(e){return this.db.prepare(`
      SELECT
        id,
        memory_session_id,
        content_session_id,
        project,
        user_prompt,
        request_summary,
        learned_summary,
        status,
        created_at,
        created_at_epoch
      FROM sdk_sessions
      WHERE id = ?
      LIMIT 1
    `).get(e)||null}getOrCreateManualSession(e){let t=`manual-${e}`,s=`manual-content-${e}`;if(this.db.prepare("SELECT memory_session_id FROM sdk_sessions WHERE memory_session_id = ?").get(t))return t;let o=new Date;return this.db.prepare(`
      INSERT INTO sdk_sessions (memory_session_id, content_session_id, project, platform_source, started_at, started_at_epoch, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `).run(t,s,e,A,o.toISOString(),o.getTime()),d.info("SESSION","Created manual session",{memorySessionId:t,project:e}),t}close(){this.db.close()}projectsWithPendingWork(e){let t=new Set;if(e.length===0)return t;let s=e.map(()=>"?").join(","),n=this.db.prepare(`
      SELECT DISTINCT s.project AS project
      FROM pending_messages pm
      JOIN sdk_sessions s ON pm.session_db_id = s.id
      WHERE s.project IN (${s})
        AND pm.status IN ('pending', 'processing')
    `).all(...e);for(let o of n)o.project&&t.add(o.project);return t}deleteProjectsCompletely(e){let t={};return e.length===0||(this.db.transaction(n=>{let o=n.map(()=>"?").join(",");for(let i of n){let a=this.db.prepare(`SELECT COUNT(*) AS n FROM observations
             WHERE project = ? OR merged_into_project = ?`).get(i,i),_=this.db.prepare(`SELECT COUNT(*) AS n FROM session_summaries
             WHERE project = ? OR merged_into_project = ?`).get(i,i),p=this.db.prepare("SELECT COUNT(*) AS n FROM sdk_sessions WHERE project = ?").get(i),E=this.db.prepare(`SELECT COUNT(*) AS n FROM user_prompts up
             JOIN sdk_sessions s ON up.content_session_id = s.content_session_id
             WHERE s.project = ?`).get(i),c=this.db.prepare(`SELECT COUNT(*) AS n FROM pending_messages pm
             JOIN sdk_sessions s ON pm.session_db_id = s.id
             WHERE s.project = ?`).get(i);t[i]={observations:a.n,summaries:_.n,sessions:p.n,prompts:E.n,pending:c.n}}this.db.prepare(`DELETE FROM observations
           WHERE project IN (${o})
              OR merged_into_project IN (${o})`).run(...n,...n),this.db.prepare(`DELETE FROM session_summaries
           WHERE project IN (${o})
              OR merged_into_project IN (${o})`).run(...n,...n),this.db.prepare(`DELETE FROM pending_messages
           WHERE session_db_id IN (
             SELECT id FROM sdk_sessions WHERE project IN (${o})
           )`).run(...n),this.db.prepare(`DELETE FROM user_prompts
           WHERE content_session_id IN (
             SELECT content_session_id FROM sdk_sessions WHERE project IN (${o})
           )`).run(...n),this.db.prepare(`DELETE FROM sdk_sessions WHERE project IN (${o})`).run(...n)})(e),d.info("SESSION","Projects deleted completely",{projects:e,counts:t})),t}deletePromptById(e){let s=this.db.prepare("DELETE FROM user_prompts WHERE id = ?").run(e).changes>0;return s&&d.info("SESSION","User prompt deleted",{id:e}),s}deletePromptWithCascade(e){let s=this.db.transaction(n=>{let o=this.db.prepare("SELECT content_session_id, prompt_number FROM user_prompts WHERE id = ?").get(n);if(!o)return null;let{content_session_id:i,prompt_number:a}=o,p=this.db.prepare("SELECT project FROM sdk_sessions WHERE content_session_id = ? LIMIT 1").get(i)?.project??"unknown",E=this.db.prepare(`SELECT o.id AS id, o.narrative AS narrative, o.text AS text, o.facts AS facts,
                o.memory_session_id AS memory_session_id, o.content_hash AS content_hash,
                o.created_at_epoch AS created_at_epoch
           FROM observations o
           JOIN sdk_sessions s ON o.memory_session_id = s.memory_session_id
          WHERE s.content_session_id = ? AND o.prompt_number = ?`).all(i,a),c=E.map(b=>b.id),m=this.db.prepare("DELETE FROM pending_messages WHERE content_session_id = ? AND prompt_number = ?").run(i,a),l=0,T=0;if(c.length>0){let b=c.map(()=>"?").join(",");l=this.db.prepare(`DELETE FROM observations WHERE id IN (${b})`).run(...c).changes;let S=E.map(h=>`${h.memory_session_id}:${h.content_hash??`${h.id}-${h.created_at_epoch}`}`);T+=this.db.prepare(`DELETE FROM sync_inbox
             WHERE source_table = 'observations'
               AND source_uid IN (${b})`).run(...S).changes}return T+=this.db.prepare(`DELETE FROM sync_inbox
           WHERE source_table = 'user_prompts' AND source_uid = ?`).run(`${i}:${a}`).changes,this.db.prepare("DELETE FROM user_prompts WHERE id = ?").run(n),{project:p,promptChromaId:`prompt_${n}`,observations:E,counts:{observations:l,pending:m.changes,syncInbox:T}}})(e);return s&&d.info("SESSION","User prompt deleted with cascade",{id:e,project:s.project,counts:s.counts}),s}importSdkSession(e){let t=this.db.prepare("SELECT id FROM sdk_sessions WHERE content_session_id = ?").get(e.content_session_id);return t?{imported:!1,id:t.id}:{imported:!0,id:this.db.prepare(`
      INSERT INTO sdk_sessions (
        content_session_id, memory_session_id, project, platform_source, user_prompt,
        started_at, started_at_epoch, completed_at, completed_at_epoch, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(e.content_session_id,e.memory_session_id,e.project,x(e.platform_source),e.user_prompt,e.started_at,e.started_at_epoch,e.completed_at,e.completed_at_epoch,e.status).lastInsertRowid}}importSessionSummary(e){let t=this.db.prepare("SELECT id FROM session_summaries WHERE memory_session_id = ?").get(e.memory_session_id);return t?{imported:!1,id:t.id}:{imported:!0,id:this.db.prepare(`
      INSERT INTO session_summaries (
        memory_session_id, project, request, investigated, learned,
        completed, next_steps, files_read, files_edited, notes,
        prompt_number, discovery_tokens, created_at, created_at_epoch
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(e.memory_session_id,e.project,e.request,e.investigated,e.learned,e.completed,e.next_steps,e.files_read,e.files_edited,e.notes,e.prompt_number,e.discovery_tokens||0,e.created_at,e.created_at_epoch).lastInsertRowid}}importObservation(e){let t=this.db.prepare(`
      SELECT id FROM observations
      WHERE memory_session_id = ? AND title = ? AND created_at_epoch = ?
    `).get(e.memory_session_id,e.title,e.created_at_epoch);return t?{imported:!1,id:t.id}:{imported:!0,id:this.db.prepare(`
      INSERT INTO observations (
        memory_session_id, project, text, type, title, subtitle,
        facts, narrative, concepts, files_read, files_modified,
        prompt_number, discovery_tokens, agent_type, agent_id,
        created_at, created_at_epoch
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(e.memory_session_id,e.project,e.text,e.type,e.title,e.subtitle,e.facts,e.narrative,e.concepts,e.files_read,e.files_modified,e.prompt_number,e.discovery_tokens||0,e.agent_type??null,e.agent_id??null,e.created_at,e.created_at_epoch).lastInsertRowid}}rebuildObservationsFTSIndex(){this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='observations_fts'").all().length>0&&this.db.run("INSERT INTO observations_fts(observations_fts) VALUES('rebuild')")}importUserPrompt(e){let t=this.db.prepare(`
      SELECT id FROM user_prompts
      WHERE content_session_id = ? AND prompt_number = ?
    `).get(e.content_session_id,e.prompt_number);return t?{imported:!1,id:t.id}:{imported:!0,id:this.db.prepare(`
      INSERT INTO user_prompts (
        content_session_id, prompt_number, prompt_text,
        created_at, created_at_epoch
      ) VALUES (?, ?, ?, ?, ?)
    `).run(e.content_session_id,e.prompt_number,e.prompt_text,e.created_at,e.created_at_epoch).lastInsertRowid}}};var I=require("fs"),X=require("path"),ge=require("os"),ee=class{static DEFAULTS={CLAUDE_MEM_MODEL:"claude-haiku-4-5-20251001",CLAUDE_MEM_CONTEXT_OBSERVATIONS:"50",CLAUDE_MEM_WORKER_PORT:String(37700+(process.getuid?.()??77)%100),CLAUDE_MEM_WORKER_HOST:"127.0.0.1",CLAUDE_MEM_SKIP_TOOLS:"ListMcpResourcesTool,SlashCommand,Skill,TodoWrite,AskUserQuestion",CLAUDE_MEM_PROVIDER:"claude",CLAUDE_MEM_CLAUDE_AUTH_METHOD:"subscription",CLAUDE_MEM_GEMINI_API_KEY:"",CLAUDE_MEM_GEMINI_MODEL:"gemini-2.5-flash-lite",CLAUDE_MEM_GEMINI_RATE_LIMITING_ENABLED:"true",CLAUDE_MEM_GEMINI_MAX_CONTEXT_MESSAGES:"20",CLAUDE_MEM_GEMINI_MAX_TOKENS:"100000",CLAUDE_MEM_OPENROUTER_API_KEY:"",CLAUDE_MEM_OPENROUTER_MODEL:"xiaomi/mimo-v2-flash:free",CLAUDE_MEM_OPENROUTER_SITE_URL:"",CLAUDE_MEM_OPENROUTER_APP_NAME:"claude-mem",CLAUDE_MEM_OPENROUTER_MAX_CONTEXT_MESSAGES:"20",CLAUDE_MEM_OPENROUTER_MAX_TOKENS:"100000",CLAUDE_MEM_DATA_DIR:(0,X.join)((0,ge.homedir)(),".claude-mem"),CLAUDE_MEM_LOG_LEVEL:"INFO",CLAUDE_MEM_PYTHON_VERSION:"3.13",CLAUDE_CODE_PATH:"",CLAUDE_MEM_MODE:"code",CLAUDE_MEM_CONTEXT_SHOW_READ_TOKENS:"false",CLAUDE_MEM_CONTEXT_SHOW_WORK_TOKENS:"false",CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_AMOUNT:"false",CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_PERCENT:"true",CLAUDE_MEM_CONTEXT_FULL_COUNT:"0",CLAUDE_MEM_CONTEXT_FULL_FIELD:"narrative",CLAUDE_MEM_CONTEXT_SESSION_COUNT:"10",CLAUDE_MEM_CONTEXT_SHOW_LAST_SUMMARY:"true",CLAUDE_MEM_CONTEXT_SHOW_LAST_MESSAGE:"false",CLAUDE_MEM_CONTEXT_SHOW_TERMINAL_OUTPUT:"true",CLAUDE_MEM_WELCOME_HINT_ENABLED:"true",CLAUDE_MEM_FOLDER_CLAUDEMD_ENABLED:"false",CLAUDE_MEM_FOLDER_USE_LOCAL_MD:"false",CLAUDE_MEM_TRANSCRIPTS_ENABLED:"true",CLAUDE_MEM_TRANSCRIPTS_CONFIG_PATH:(0,X.join)((0,ge.homedir)(),".claude-mem","transcript-watch.json"),CLAUDE_MEM_CODEX_TRANSCRIPT_INGESTION:"false",CLAUDE_MEM_MAX_CONCURRENT_AGENTS:"2",CLAUDE_MEM_REPORT_BATCH_CONCURRENCY:"6",CLAUDE_MEM_HOOK_FAIL_LOUD_THRESHOLD:"3",CLAUDE_MEM_EXCLUDED_PROJECTS:"",CLAUDE_MEM_FOLDER_MD_EXCLUDE:"[]",CLAUDE_MEM_SEMANTIC_INJECT:"false",CLAUDE_MEM_SEMANTIC_INJECT_LIMIT:"5",CLAUDE_MEM_TIER_ROUTING_ENABLED:"true",CLAUDE_MEM_TIER_SIMPLE_MODEL:"haiku",CLAUDE_MEM_TIER_SUMMARY_MODEL:"",CLAUDE_MEM_CHROMA_ENABLED:"true",CLAUDE_MEM_PROMPT_SHOW_PROCESSING_TIME:"1",CLAUDE_MEM_THINK_TIME_CAP_MINUTES:"0",CLAUDE_MEM_CHROMA_MODE:"local",CLAUDE_MEM_CHROMA_HOST:"127.0.0.1",CLAUDE_MEM_CHROMA_PORT:"8000",CLAUDE_MEM_CHROMA_SSL:"false",CLAUDE_MEM_CHROMA_API_KEY:"",CLAUDE_MEM_CHROMA_TENANT:"default_tenant",CLAUDE_MEM_CHROMA_DATABASE:"default_database",CLAUDE_MEM_TELEGRAM_ENABLED:"true",CLAUDE_MEM_TELEGRAM_BOT_TOKEN:"",CLAUDE_MEM_TELEGRAM_CHAT_ID:"",CLAUDE_MEM_TELEGRAM_TRIGGER_TYPES:"security_alert",CLAUDE_MEM_TELEGRAM_TRIGGER_CONCEPTS:"",CLAUDE_MEM_QUEUE_ENGINE:"sqlite",CLAUDE_MEM_REDIS_URL:"",CLAUDE_MEM_REDIS_HOST:"127.0.0.1",CLAUDE_MEM_REDIS_PORT:"6379",CLAUDE_MEM_REDIS_MODE:"external",CLAUDE_MEM_QUEUE_REDIS_PREFIX:`claude_mem_${process.env.CLAUDE_MEM_WORKER_PORT??String(37700+(process.getuid?.()??77)%100)}`,CLAUDE_MEM_AUTH_MODE:"api-key",CLAUDE_MEM_RUNTIME:"worker",CLAUDE_MEM_SERVER_BETA_URL:`http://127.0.0.1:${process.env.CLAUDE_MEM_SERVER_PORT??String(37877+(process.getuid?.()??77)%100)}`,CLAUDE_MEM_SERVER_BETA_API_KEY:"",CLAUDE_MEM_SERVER_BETA_PROJECT_ID:"",CLAUDE_MEM_NODE_ROLE:"client",CLAUDE_MEM_USER_LABEL:"",CLAUDE_MEM_SYNC_ENABLED:"true",CLAUDE_MEM_SYNC_UPSTREAM_URL:"",CLAUDE_MEM_SYNC_AUTH_MODE:"none",CLAUDE_MEM_SYNC_API_KEY:"",CLAUDE_MEM_SYNC_INTERVAL_MS:"5000",CLAUDE_MEM_SYNC_BATCH_SIZE:"200",CLAUDE_MEM_SYNC_RETRY_MAX:"8",CLAUDE_MEM_SYNC_REDACT_PATTERNS:"",CLAUDE_MEM_SERVER_BIND_HOST:"",CLAUDE_MEM_SERVER_AUTH_MODE:"none",CLAUDE_MEM_SERVER_ALLOWED_USERS:"",CLAUDE_MEM_SERVER_ACCESS_TOKEN:"",CLAUDE_MEM_SERVER_LOCAL_AUTO_LOGIN:"true",CLAUDE_MEM_SERVER_INGEST_MAX_BATCH:"1000",CLAUDE_MEM_SERVER_REQUIRE_TLS:"false",CLAUDE_MEM_SYNC_ACCESS_TOKEN:"",CLAUDE_MEM_WEEKLY_REPORT_ENABLED:"true",CLAUDE_MEM_WEEKLY_REPORT_TIME:"13:00",CLAUDE_MEM_WEEKLY_REPORT_MODEL:"qwen3-max",DASHSCOPE_API_KEY:""};static getAllDefaults(){return{...this.DEFAULTS}}static get(e){return process.env[e]??this.DEFAULTS[e]}static getInt(e){let t=this.get(e);return parseInt(t,10)}static getBool(e){let t=this.get(e);return t==="true"||t===!0}static applyEnvOverrides(e){let t={...e};for(let s of Object.keys(this.DEFAULTS))process.env[s]!==void 0&&(t[s]=process.env[s]);return t}static loadFromFile(e){try{if(!(0,I.existsSync)(e)){let i=this.getAllDefaults();try{let a=(0,X.dirname)(e);(0,I.existsSync)(a)||(0,I.mkdirSync)(a,{recursive:!0}),(0,I.writeFileSync)(e,JSON.stringify(i,null,2),"utf-8"),console.log("[SETTINGS] Created settings file with defaults:",e)}catch(a){console.warn("[SETTINGS] Failed to create settings file, using in-memory defaults:",e,a instanceof Error?a.message:String(a))}return this.applyEnvOverrides(i)}let t=(0,I.readFileSync)(e,"utf-8"),s=JSON.parse(t.replace(/^\uFEFF/,"")),n=s;if(s.env&&typeof s.env=="object"){let{env:i,...a}=s;n={...a,...i};try{(0,I.writeFileSync)(e,JSON.stringify(n,null,2),"utf-8"),console.log("[SETTINGS] Migrated settings file from nested to flat schema:",e)}catch(_){console.warn("[SETTINGS] Failed to auto-migrate settings file:",e,_ instanceof Error?_.message:String(_))}}let o={...this.DEFAULTS};for(let i of Object.keys(this.DEFAULTS))n[i]!==void 0&&(o[i]=n[i]);return this.applyEnvOverrides(o)}catch(t){return console.warn("[SETTINGS] Failed to load settings, using defaults:",e,t instanceof Error?t.message:String(t)),this.applyEnvOverrides(this.getAllDefaults())}}};var G=require("fs"),te=require("path");var C=class r{static instance=null;activeMode=null;modesDir;constructor(){let e=Fe(),t=[...process.env.CLAUDE_MEM_MODES_DIR?[process.env.CLAUDE_MEM_MODES_DIR]:[],(0,te.join)(e,"modes"),(0,te.join)(e,"..","plugin","modes")],s=t.find(n=>(0,G.existsSync)(n));this.modesDir=s||t[0]}static getInstance(){return r.instance||(r.instance=new r),r.instance}parseInheritance(e){let t=e.split("--");if(t.length===1)return{hasParent:!1,parentId:"",overrideId:""};if(t.length>2)throw new Error(`Invalid mode inheritance: ${e}. Only one level of inheritance supported (parent--override)`);return{hasParent:!0,parentId:t[0],overrideId:e}}isPlainObject(e){return e!==null&&typeof e=="object"&&!Array.isArray(e)}deepMerge(e,t){let s={...e};for(let n in t){let o=t[n],i=e[n];this.isPlainObject(o)&&this.isPlainObject(i)?s[n]=this.deepMerge(i,o):s[n]=o}return s}loadModeFile(e){let t=(0,te.join)(this.modesDir,`${e}.json`);if(!(0,G.existsSync)(t))throw new Error(`Mode file not found: ${t}`);let s=(0,G.readFileSync)(t,"utf-8");return JSON.parse(s)}loadMode(e){let t=this.parseInheritance(e);if(!t.hasParent)try{let _=this.loadModeFile(e);return this.activeMode=_,d.debug("SYSTEM",`Loaded mode: ${_.name} (${e})`,void 0,{types:_.observation_types.map(p=>p.id),concepts:_.observation_concepts.map(p=>p.id)}),_}catch(_){if(_ instanceof Error?d.warn("WORKER",`Mode file not found: ${e}, falling back to 'code'`,{message:_.message}):d.warn("WORKER",`Mode file not found: ${e}, falling back to 'code'`,{error:String(_)}),e==="code")throw new Error("Critical: code.json mode file missing");return this.loadMode("code")}let{parentId:s,overrideId:n}=t,o;try{o=this.loadMode(s)}catch(_){_ instanceof Error?d.warn("WORKER",`Parent mode '${s}' not found for ${e}, falling back to 'code'`,{message:_.message}):d.warn("WORKER",`Parent mode '${s}' not found for ${e}, falling back to 'code'`,{error:String(_)}),o=this.loadMode("code")}let i;try{i=this.loadModeFile(n),d.debug("SYSTEM",`Loaded override file: ${n} for parent ${s}`)}catch(_){return _ instanceof Error?d.warn("WORKER",`Override file '${n}' not found, using parent mode '${s}' only`,{message:_.message}):d.warn("WORKER",`Override file '${n}' not found, using parent mode '${s}' only`,{error:String(_)}),this.activeMode=o,o}if(!i)return d.warn("SYSTEM",`Invalid override file: ${n}, using parent mode '${s}' only`),this.activeMode=o,o;let a=this.deepMerge(o,i);return this.activeMode=a,d.debug("SYSTEM",`Loaded mode with inheritance: ${a.name} (${e} = ${s} + ${n})`,void 0,{parent:s,override:n,types:a.observation_types.map(_=>_.id),concepts:a.observation_concepts.map(_=>_.id)}),a}getActiveMode(){if(!this.activeMode)throw new Error("No mode loaded. Call loadMode() first.");return this.activeMode}getObservationTypes(){return this.getActiveMode().observation_types}getObservationConcepts(){return this.getActiveMode().observation_concepts}getTypeIcon(e){return this.getObservationTypes().find(s=>s.id===e)?.emoji||"\u{1F4DD}"}getWorkEmoji(e){return this.getObservationTypes().find(s=>s.id===e)?.work_emoji||"\u{1F4DD}"}validateType(e){return this.getObservationTypes().some(t=>t.id===e)}getTypeLabel(e){return this.getObservationTypes().find(s=>s.id===e)?.label||e}};function Te(){let r=v.settings(),e=ee.loadFromFile(r),t=C.getInstance().getActiveMode(),s=new Set(t.observation_types.map(o=>o.id)),n=new Set(t.observation_concepts.map(o=>o.id));return{totalObservationCount:parseInt(e.CLAUDE_MEM_CONTEXT_OBSERVATIONS,10),fullObservationCount:parseInt(e.CLAUDE_MEM_CONTEXT_FULL_COUNT,10),sessionCount:parseInt(e.CLAUDE_MEM_CONTEXT_SESSION_COUNT,10),showReadTokens:e.CLAUDE_MEM_CONTEXT_SHOW_READ_TOKENS==="true",showWorkTokens:e.CLAUDE_MEM_CONTEXT_SHOW_WORK_TOKENS==="true",showSavingsAmount:e.CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_AMOUNT==="true",showSavingsPercent:e.CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_PERCENT==="true",observationTypes:s,observationConcepts:n,fullObservationField:e.CLAUDE_MEM_CONTEXT_FULL_FIELD,showLastSummary:e.CLAUDE_MEM_CONTEXT_SHOW_LAST_SUMMARY==="true",showLastMessage:e.CLAUDE_MEM_CONTEXT_SHOW_LAST_MESSAGE==="true"}}var u={reset:"\x1B[0m",bright:"\x1B[1m",dim:"\x1B[2m",cyan:"\x1B[36m",green:"\x1B[32m",yellow:"\x1B[33m",blue:"\x1B[34m",magenta:"\x1B[35m",gray:"\x1B[90m",red:"\x1B[31m"},Qe=4,be=1;function Se(r){let e=(r.title?.length||0)+(r.subtitle?.length||0)+(r.narrative?.length||0)+JSON.stringify(r.facts||[]).length;return Math.ceil(e/Qe)}function fe(r){let e=r.length,t=r.reduce((i,a)=>i+Se(a),0),s=r.reduce((i,a)=>i+(a.discovery_tokens||0),0),n=s-t,o=s>0?Math.round(n/s*100):0;return{totalObservations:e,totalReadTokens:t,totalDiscoveryTokens:s,savings:n,savingsPercent:o}}function gs(r){return C.getInstance().getWorkEmoji(r)}function B(r,e){let t=Se(r),s=r.discovery_tokens||0,n=gs(r.type),o=s>0?`${n} ${s.toLocaleString()}`:"-";return{readTokens:t,discoveryTokens:s,discoveryDisplay:o,workEmoji:n}}function se(r){return r.showReadTokens||r.showWorkTokens||r.showSavingsAmount||r.showSavingsPercent}var Ze=w(require("path"),1),re=require("fs");var Ts=["private","claude-mem-context","system_instruction","system-instruction","persisted-output","system-reminder"],Nr=new RegExp(`<(${Ts.join("|")})\\b[^>]*>[\\s\\S]*?</\\1>`,"g"),ze=/<system-reminder>[\s\S]*?<\/system-reminder>/g;var bs=["task-notification"],Cr=new RegExp(`^\\s*<(${bs.join("|")})\\b[^>]*>(?:(?!<\\1\\b|</\\1\\b)[\\s\\S])*</\\1>\\s*$`),Lr=256*1024;function Re(r,e,t){let s=Array.from(t.observationTypes),n=s.map(()=>"?").join(","),o=Array.from(t.observationConcepts),i=o.map(()=>"?").join(",");return r.db.prepare(`
    SELECT
      o.id,
      o.memory_session_id,
      COALESCE(s.platform_source, 'claude') as platform_source,
      o.type,
      o.title,
      o.subtitle,
      o.narrative,
      o.facts,
      o.concepts,
      o.files_read,
      o.files_modified,
      o.discovery_tokens,
      o.created_at,
      o.created_at_epoch
    FROM observations o
    LEFT JOIN sdk_sessions s ON o.memory_session_id = s.memory_session_id
    WHERE (o.project = ? OR o.merged_into_project = ?)
      AND type IN (${n})
      AND EXISTS (
        SELECT 1 FROM json_each(o.concepts)
        WHERE value IN (${i})
      )
    ORDER BY o.created_at_epoch DESC
    LIMIT ?
  `).all(e,e,...s,...o,t.totalObservationCount)}function he(r,e,t){return r.db.prepare(`
    SELECT
      ss.id,
      ss.memory_session_id,
      COALESCE(s.platform_source, 'claude') as platform_source,
      ss.request,
      ss.investigated,
      ss.learned,
      ss.completed,
      ss.next_steps,
      ss.created_at,
      ss.created_at_epoch
    FROM session_summaries ss
    LEFT JOIN sdk_sessions s ON ss.memory_session_id = s.memory_session_id
    WHERE (ss.project = ? OR ss.merged_into_project = ?)
    ORDER BY ss.created_at_epoch DESC
    LIMIT ?
  `).all(e,e,t.sessionCount+be)}function et(r,e,t){let s=Array.from(t.observationTypes),n=s.map(()=>"?").join(","),o=Array.from(t.observationConcepts),i=o.map(()=>"?").join(","),a=e.map(()=>"?").join(",");return r.db.prepare(`
    SELECT
      o.id,
      o.memory_session_id,
      COALESCE(s.platform_source, 'claude') as platform_source,
      o.type,
      o.title,
      o.subtitle,
      o.narrative,
      o.facts,
      o.concepts,
      o.files_read,
      o.files_modified,
      o.discovery_tokens,
      o.created_at,
      o.created_at_epoch,
      o.project
    FROM observations o
    LEFT JOIN sdk_sessions s ON o.memory_session_id = s.memory_session_id
    WHERE (o.project IN (${a})
           OR o.merged_into_project IN (${a}))
      AND type IN (${n})
      AND EXISTS (
        SELECT 1 FROM json_each(o.concepts)
        WHERE value IN (${i})
      )
    ORDER BY o.created_at_epoch DESC
    LIMIT ?
  `).all(...e,...e,...s,...o,t.totalObservationCount)}function tt(r,e,t){let s=e.map(()=>"?").join(",");return r.db.prepare(`
    SELECT
      ss.id,
      ss.memory_session_id,
      COALESCE(s.platform_source, 'claude') as platform_source,
      ss.request,
      ss.investigated,
      ss.learned,
      ss.completed,
      ss.next_steps,
      ss.created_at,
      ss.created_at_epoch,
      ss.project
    FROM session_summaries ss
    LEFT JOIN sdk_sessions s ON ss.memory_session_id = s.memory_session_id
    WHERE (ss.project IN (${s})
           OR ss.merged_into_project IN (${s}))
    ORDER BY ss.created_at_epoch DESC
    LIMIT ?
  `).all(...e,...e,t.sessionCount+be)}function Ss(r){return r.replace(/\//g,"-")}function fs(r){if(!r.includes('"type":"assistant"'))return null;let e=JSON.parse(r);if(e.type==="assistant"&&e.message?.content&&Array.isArray(e.message.content)){let t="";for(let s of e.message.content)s.type==="text"&&(t+=s.text);if(t=t.replace(ze,"").trim(),t)return t}return null}function Rs(r){for(let e=r.length-1;e>=0;e--)try{let t=fs(r[e]);if(t)return t}catch(t){t instanceof Error?d.debug("WORKER","Skipping malformed transcript line",{lineIndex:e},t):d.debug("WORKER","Skipping malformed transcript line",{lineIndex:e,error:String(t)});continue}return""}function hs(r){try{if(!(0,re.existsSync)(r))return{userMessage:"",assistantMessage:""};let e=(0,re.readFileSync)(r,"utf-8").trim();if(!e)return{userMessage:"",assistantMessage:""};let t=e.split(`
`).filter(n=>n.trim());return{userMessage:"",assistantMessage:Rs(t)}}catch(e){return e instanceof Error?d.failure("WORKER","Failed to extract prior messages from transcript",{transcriptPath:r},e):d.warn("WORKER","Failed to extract prior messages from transcript",{transcriptPath:r,error:String(e)}),{userMessage:"",assistantMessage:""}}}function Oe(r,e,t,s){if(!e.showLastMessage||r.length===0)return{userMessage:"",assistantMessage:""};let n=r.find(_=>_.memory_session_id!==t);if(!n)return{userMessage:"",assistantMessage:""};let o=n.memory_session_id,i=Ss(s),a=Ze.default.join(U,"projects",i,`${o}.jsonl`);return hs(a)}function st(r,e){let t=e[0]?.id;return r.map((s,n)=>{let o=n===0?null:e[n+1];return{...s,displayEpoch:o?o.created_at_epoch:s.created_at_epoch,displayTime:o?o.created_at:s.created_at,shouldShowLink:s.id!==t}})}function Ae(r,e){let t=[...r.map(s=>({type:"observation",data:s})),...e.map(s=>({type:"summary",data:s}))];return t.sort((s,n)=>{let o=s.type==="observation"?s.data.created_at_epoch:s.data.displayEpoch,i=n.type==="observation"?n.data.created_at_epoch:n.data.displayEpoch;return o-i}),t}function rt(r,e){return new Set(r.slice(0,e).map(t=>t.id))}function nt(){let r=new Date,e=r.toLocaleDateString("en-CA"),t=r.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0}).toLowerCase().replace(" ",""),s=r.toLocaleTimeString("en-US",{timeZoneName:"short"}).split(" ").pop();return`${e} ${t} ${s}`}function ot(r){return[`# [${r}] recent context, ${nt()}`,""]}function it(){return[`Legend: \u{1F3AF}session ${C.getInstance().getActiveMode().observation_types.map(t=>`${t.emoji}${t.id}`).join(" ")}`,"Format: ID TIME TYPE TITLE","Fetch details: get_observations([IDs]) | Search: mem-search skill",""]}function at(){return[]}function _t(){return[]}function dt(r,e){let t=[],s=[`${r.totalObservations} obs (${r.totalReadTokens.toLocaleString()}t read)`,`${r.totalDiscoveryTokens.toLocaleString()}t work`];return r.totalDiscoveryTokens>0&&(e.showSavingsAmount||e.showSavingsPercent)&&(e.showSavingsPercent?s.push(`${r.savingsPercent}% savings`):e.showSavingsAmount&&s.push(`${r.savings.toLocaleString()}t saved`)),t.push(`Stats: ${s.join(" | ")}`),t.push(""),t}function pt(r){return[`### ${r}`]}function ut(r){return r.toLowerCase().replace(" am","a").replace(" pm","p")}function Et(r,e,t){let s=r.title||"Untitled",n=C.getInstance().getTypeIcon(r.type),o=e?ut(e):'"';return`${r.id} ${o} ${n} ${s}`}function lt(r,e,t,s){let n=[],o=r.title||"Untitled",i=C.getInstance().getTypeIcon(r.type),a=e?ut(e):'"',{readTokens:_,discoveryDisplay:p}=B(r,s);n.push(`**${r.id}** ${a} ${i} **${o}**`),t&&n.push(t);let E=[];return s.showReadTokens&&E.push(`~${_}t`),s.showWorkTokens&&E.push(p),E.length>0&&n.push(E.join(" ")),n.push(""),n}function ct(r,e){return[`S${r.id} ${r.request||"Session started"} (${e})`]}function W(r,e){return e?[`**${r}**: ${e}`,""]:[]}function mt(r){return r.assistantMessage?["","---","","**Previously**","",`A: ${r.assistantMessage}`,""]:[]}function gt(r,e){return["",`Access ${Math.round(r/1e3)}k tokens of past work via get_observations([IDs]) or mem-search skill.`]}function Tt(r){return`# [${r}] recent context, ${nt()}

No previous sessions found.`}function bt(){let r=new Date,e=r.toLocaleDateString("en-CA"),t=r.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0}).toLowerCase().replace(" ",""),s=r.toLocaleTimeString("en-US",{timeZoneName:"short"}).split(" ").pop();return`${e} ${t} ${s}`}function St(r){return["",`${u.bright}${u.cyan}[${r}] recent context, ${bt()}${u.reset}`,`${u.gray}${"\u2500".repeat(60)}${u.reset}`,""]}function ft(){let e=C.getInstance().getActiveMode().observation_types.map(t=>`${t.emoji} ${t.id}`).join(" | ");return[`${u.dim}Legend: session-request | ${e}${u.reset}`,""]}function Rt(){return[`${u.bright}Column Key${u.reset}`,`${u.dim}  Read: Tokens to read this observation (cost to learn it now)${u.reset}`,`${u.dim}  Work: Tokens spent on work that produced this record ( research, building, deciding)${u.reset}`,""]}function ht(){return[`${u.dim}Context Index: This semantic index (titles, types, files, tokens) is usually sufficient to understand past work.${u.reset}`,"",`${u.dim}When you need implementation details, rationale, or debugging context:${u.reset}`,`${u.dim}  - Fetch by ID: get_observations([IDs]) for observations visible in this index${u.reset}`,`${u.dim}  - Search history: Use the mem-search skill for past decisions, bugs, and deeper research${u.reset}`,`${u.dim}  - Trust this index over re-reading code for past decisions and learnings${u.reset}`,""]}function Ot(r,e){let t=[];if(t.push(`${u.bright}${u.cyan}Context Economics${u.reset}`),t.push(`${u.dim}  Loading: ${r.totalObservations} observations (${r.totalReadTokens.toLocaleString()} tokens to read)${u.reset}`),t.push(`${u.dim}  Work investment: ${r.totalDiscoveryTokens.toLocaleString()} tokens spent on research, building, and decisions${u.reset}`),r.totalDiscoveryTokens>0&&(e.showSavingsAmount||e.showSavingsPercent)){let s="  Your savings: ";e.showSavingsAmount&&e.showSavingsPercent?s+=`${r.savings.toLocaleString()} tokens (${r.savingsPercent}% reduction from reuse)`:e.showSavingsAmount?s+=`${r.savings.toLocaleString()} tokens`:s+=`${r.savingsPercent}% reduction from reuse`,t.push(`${u.green}${s}${u.reset}`)}return t.push(""),t}function At(r){return[`${u.bright}${u.cyan}${r}${u.reset}`,""]}function Nt(r){return[`${u.dim}${r}${u.reset}`]}function Ct(r,e,t,s){let n=r.title||"Untitled",o=C.getInstance().getTypeIcon(r.type),{readTokens:i,discoveryTokens:a,workEmoji:_}=B(r,s),p=t?`${u.dim}${e}${u.reset}`:" ".repeat(e.length),E=s.showReadTokens&&i>0?`${u.dim}(~${i}t)${u.reset}`:"",c=s.showWorkTokens&&a>0?`${u.dim}(${_} ${a.toLocaleString()}t)${u.reset}`:"";return`  ${u.dim}#${r.id}${u.reset}  ${p}  ${o}  ${n} ${E} ${c}`}function Lt(r,e,t,s,n){let o=[],i=r.title||"Untitled",a=C.getInstance().getTypeIcon(r.type),{readTokens:_,discoveryTokens:p,workEmoji:E}=B(r,n),c=t?`${u.dim}${e}${u.reset}`:" ".repeat(e.length),m=n.showReadTokens&&_>0?`${u.dim}(~${_}t)${u.reset}`:"",l=n.showWorkTokens&&p>0?`${u.dim}(${E} ${p.toLocaleString()}t)${u.reset}`:"";return o.push(`  ${u.dim}#${r.id}${u.reset}  ${c}  ${a}  ${u.bright}${i}${u.reset}`),s&&o.push(`    ${u.dim}${s}${u.reset}`),(m||l)&&o.push(`    ${m} ${l}`),o.push(""),o}function It(r,e){let t=`${r.request||"Session started"} (${e})`;return[`${u.yellow}#S${r.id}${u.reset} ${t}`,""]}function Y(r,e,t){return e?[`${t}${r}:${u.reset} ${e}`,""]:[]}function Mt(r){return r.assistantMessage?["","---","",`${u.bright}${u.magenta}Previously${u.reset}`,"",`${u.dim}A: ${r.assistantMessage}${u.reset}`,""]:[]}function Dt(r,e){let t=Math.round(r/1e3);return["",`${u.dim}Access ${t}k tokens of past research & decisions for just ${e.toLocaleString()}t. Use the claude-mem skill to access memories by ID.${u.reset}`]}function vt(r){return`
${u.bright}${u.cyan}[${r}] recent context, ${bt()}${u.reset}
${u.gray}${"\u2500".repeat(60)}${u.reset}

${u.dim}No previous sessions found for this project yet.${u.reset}
`}function yt(r,e,t,s){let n=[];return s?n.push(...St(r)):n.push(...ot(r)),s?n.push(...ft()):n.push(...it()),s?n.push(...Rt()):n.push(...at()),s?n.push(...ht()):n.push(..._t()),se(t)&&(s?n.push(...Ot(e,t)):n.push(...dt(e,t))),n}var Ne=w(require("path"),1);function ie(r){if(!r)return[];try{let e=JSON.parse(r);return Array.isArray(e)?e:[]}catch(e){return d.debug("PARSER","Failed to parse JSON array, using empty fallback",{preview:r?.substring(0,50)},e instanceof Error?e:new Error(String(e))),[]}}function Ce(r){return new Date(r).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit",hour12:!0})}function Le(r){return new Date(r).toLocaleString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0})}function xt(r){return new Date(r).toLocaleString("en-US",{month:"short",day:"numeric",year:"numeric"})}function Ut(r,e){return Ne.default.isAbsolute(r)?Ne.default.relative(e,r):r}function kt(r,e,t){let s=ie(r);if(s.length>0)return Ut(s[0],e);if(t){let n=ie(t);if(n.length>0)return Ut(n[0],e)}return"General"}function Os(r){let e=new Map;for(let s of r){let n=s.type==="observation"?s.data.created_at:s.data.displayTime,o=xt(n);e.has(o)||e.set(o,[]),e.get(o).push(s)}let t=Array.from(e.entries()).sort((s,n)=>{let o=new Date(s[0]).getTime(),i=new Date(n[0]).getTime();return o-i});return new Map(t)}function Ft(r,e){return e.fullObservationField==="narrative"?r.narrative:r.facts?ie(r.facts).join(`
`):null}function As(r,e,t,s){let n=[];n.push(...pt(r));let o="";for(let i of e)if(i.type==="summary"){let a=i.data,_=Ce(a.displayTime);n.push(...ct(a,_))}else{let a=i.data,_=Le(a.created_at),E=_!==o?_:"";if(o=_,t.has(a.id)){let m=Ft(a,s);n.push(...lt(a,E,m,s))}else n.push(Et(a,E,s))}return n}function Ns(r,e,t,s,n){let o=[];o.push(...At(r));let i=null,a="";for(let _ of e)if(_.type==="summary"){i=null,a="";let p=_.data,E=Ce(p.displayTime);o.push(...It(p,E))}else{let p=_.data,E=kt(p.files_modified,n,p.files_read),c=Le(p.created_at),m=c!==a;a=c;let l=t.has(p.id);if(E!==i&&(o.push(...Nt(E)),i=E),l){let T=Ft(p,s);o.push(...Lt(p,c,m,T,s))}else o.push(Ct(p,c,m,s))}return o.push(""),o}function Cs(r,e,t,s,n,o){return o?Ns(r,e,t,s,n):As(r,e,t,s)}function wt(r,e,t,s,n){let o=[],i=Os(r);for(let[a,_]of i)o.push(...Cs(a,_,e,t,s,n));return o}function Pt(r,e,t){return!(!r.showLastSummary||!e||!!!(e.investigated||e.learned||e.completed||e.next_steps)||t&&e.created_at_epoch<=t.created_at_epoch)}function $t(r,e){let t=[];return e?(t.push(...Y("Investigated",r.investigated,u.blue)),t.push(...Y("Learned",r.learned,u.yellow)),t.push(...Y("Completed",r.completed,u.green)),t.push(...Y("Next Steps",r.next_steps,u.magenta))):(t.push(...W("Investigated",r.investigated)),t.push(...W("Learned",r.learned)),t.push(...W("Completed",r.completed)),t.push(...W("Next Steps",r.next_steps))),t}function Ht(r,e){return e?Mt(r):mt(r)}function jt(r,e,t){return!se(e)||r.totalDiscoveryTokens<=0||r.savings<=0?[]:t?Dt(r.totalDiscoveryTokens,r.totalReadTokens):gt(r.totalDiscoveryTokens,r.totalReadTokens)}var Ls=Xt.default.join((0,Gt.homedir)(),".claude","plugins","marketplaces","thedotmack","plugin",".install-version");function Is(){try{return new z}catch(r){if(r instanceof Error&&r.code==="ERR_DLOPEN_FAILED"){try{(0,Bt.unlinkSync)(Ls)}catch(e){e instanceof Error?d.debug("WORKER","Marker file cleanup failed (may not exist)",{},e):d.debug("WORKER","Marker file cleanup failed (may not exist)",{error:String(e)})}return d.error("WORKER","Native module rebuild needed - restart Claude Code to auto-fix"),null}throw r}}function Ms(r,e){return e?vt(r):Tt(r)}function Ds(r,e,t,s,n,o,i){let a=[],_=fe(e);a.push(...yt(r,_,s,i));let p=t.slice(0,s.sessionCount),E=st(p,t),c=Ae(e,E),m=rt(e,s.fullObservationCount);a.push(...wt(c,m,s,n,i));let l=t[0],T=e[0];Pt(s,l,T)&&a.push(...$t(l,i));let b=Oe(e,s,o,n);return a.push(...Ht(b,i)),a.push(...jt(_,s,i)),a.join(`
`).trimEnd()}async function Ie(r,e=!1){let t=Te(),s=r?.cwd??process.cwd(),n=le(s),o=r?.projects?.length?r.projects:n.allProjects,i=o[o.length-1]??n.primary;r?.full&&(t.totalObservationCount=999999,t.sessionCount=999999);let a=Is();if(!a)return"";try{let _=o.length>1?et(a,o,t):Re(a,i,t),p=o.length>1?tt(a,o,t):he(a,i,t);return _.length===0&&p.length===0?Ms(i,e):Ds(i,_,p,t,s,r?.session_id,e)}finally{a.close()}}0&&(module.exports={generateContext});
