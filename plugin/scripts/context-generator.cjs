"use strict";var kt=Object.create;var j=Object.defineProperty;var wt=Object.getOwnPropertyDescriptor;var Ft=Object.getOwnPropertyNames;var Pt=Object.getPrototypeOf,$t=Object.prototype.hasOwnProperty;var Ht=(r,e)=>{for(var t in e)j(r,t,{get:e[t],enumerable:!0})},Ae=(r,e,t,s)=>{if(e&&typeof e=="object"||typeof e=="function")for(let n of Ft(e))!$t.call(r,n)&&n!==t&&j(r,n,{get:()=>e[n],enumerable:!(s=wt(e,n))||s.enumerable});return r};var U=(r,e,t)=>(t=r!=null?kt(Pt(r)):{},Ae(e||!r||!r.__esModule?j(t,"default",{value:r,enumerable:!0}):t,r)),jt=r=>Ae(j({},"__esModule",{value:!0}),r);var fs={};Ht(fs,{generateContext:()=>Re});module.exports=jt(fs);var yt=U(require("path"),1),Ut=require("os"),xt=require("fs");var de=require("bun:sqlite"),V=require("fs");var T=require("path"),ee=require("os"),D=require("fs"),Ce=require("url"),Qt={};function Gt(){return typeof __dirname<"u"?__dirname:(0,T.dirname)((0,Ce.fileURLToPath)(Qt.url))}var Xt=Gt();function Bt(){if(process.env.CLAUDE_MEM_DATA_DIR)return process.env.CLAUDE_MEM_DATA_DIR;let r=(0,T.join)((0,ee.homedir)(),".claude-mem"),e=(0,T.join)(r,"settings.json");try{if((0,D.existsSync)(e)){let t=JSON.parse((0,D.readFileSync)(e,"utf-8")),s=t.env??t;if(s.CLAUDE_MEM_DATA_DIR)return s.CLAUDE_MEM_DATA_DIR}}catch{}return r}var b=Bt(),v=process.env.CLAUDE_CONFIG_DIR||(0,T.join)((0,ee.homedir)(),".claude"),hs=(0,T.join)(v,"plugins","marketplaces","thedotmack"),Wt=(0,T.join)(b,"archives"),Vt=(0,T.join)(b,"logs"),Yt=(0,T.join)(b,"trash"),qt=(0,T.join)(b,"backups"),Kt=(0,T.join)(b,"modes"),te=(0,T.join)(b,"settings.json"),Ne=(0,T.join)(b,"claude-mem.db"),Jt=(0,T.join)(b,"vector-db"),Ie=(0,T.join)(b,"observer-sessions"),se=(0,T.basename)(Ie),Os=(0,T.join)(v,"settings.json"),As=(0,T.join)(v,"commands"),Cs=(0,T.join)(v,"CLAUDE.md");function Le(r){(0,D.mkdirSync)(r,{recursive:!0})}function Me(){return(0,T.join)(Xt,"..")}var x={dataDir:()=>b,workerPid:()=>(0,T.join)(b,"worker.pid"),serverBetaPid:()=>(0,T.join)(b,".server-beta.pid"),serverBetaPort:()=>(0,T.join)(b,".server-beta.port"),serverBetaRuntime:()=>(0,T.join)(b,".server-beta.runtime.json"),settings:()=>(0,T.join)(b,"settings.json"),database:()=>(0,T.join)(b,"claude-mem.db"),chroma:()=>(0,T.join)(b,"chroma"),combinedCerts:()=>(0,T.join)(b,"combined_certs.pem"),transcriptsConfig:()=>(0,T.join)(b,"transcript-watch.json"),transcriptsState:()=>(0,T.join)(b,"transcript-watch-state.json"),syncState:()=>(0,T.join)(b,"sync-state.json"),corpora:()=>(0,T.join)(b,"corpora"),supervisorRegistry:()=>(0,T.join)(b,"supervisor.json"),envFile:()=>(0,T.join)(b,".env"),logsDir:()=>Vt,archives:()=>Wt,trash:()=>Yt,backups:()=>qt,modes:()=>Kt,vectorDb:()=>Jt,observerSessions:()=>Ie};var L=require("fs"),De=require("path");var re=(o=>(o[o.DEBUG=0]="DEBUG",o[o.INFO=1]="INFO",o[o.WARN=2]="WARN",o[o.ERROR=3]="ERROR",o[o.SILENT=4]="SILENT",o))(re||{}),ne=class{level=null;useColor;logFilePath=null;logFileInitialized=!1;constructor(){this.useColor=process.stdout.isTTY??!1}ensureLogFileInitialized(){if(!this.logFileInitialized){this.logFileInitialized=!0;try{let e=x.logsDir();(0,L.existsSync)(e)||(0,L.mkdirSync)(e,{recursive:!0});let t=new Date().toISOString().split("T")[0];this.logFilePath=(0,De.join)(e,`claude-mem-${t}.log`)}catch(e){console.error("[LOGGER] Failed to initialize log file:",e instanceof Error?e.message:String(e)),this.logFilePath=null}}}getLevel(){if(this.level===null)try{let e=x.settings();if((0,L.existsSync)(e)){let t=(0,L.readFileSync)(e,"utf-8"),n=(JSON.parse(t).CLAUDE_MEM_LOG_LEVEL||"INFO").toUpperCase();this.level=re[n]??1}else this.level=1}catch(e){console.error("[LOGGER] Failed to load log level from settings:",e instanceof Error?e.message:String(e)),this.level=1}return this.level}correlationId(e,t){return`obs-${e}-${t}`}sessionId(e){return`session-${e}`}formatData(e){if(e==null)return"";if(typeof e=="string")return e;if(typeof e=="number"||typeof e=="boolean")return e.toString();if(typeof e=="object"){if(e instanceof Error)return this.getLevel()===0?`${e.message}
${e.stack}`:e.message;if(Array.isArray(e))return`[${e.length} items]`;let t=Object.keys(e);return t.length===0?"{}":t.length<=3?JSON.stringify(e):`{${t.length} keys: ${t.slice(0,3).join(", ")}...}`}return String(e)}formatTool(e,t){if(!t)return e;let s=t;if(typeof t=="string")try{s=JSON.parse(t)}catch{s=t}if(e==="Bash"&&s.command)return`${e}(${s.command})`;if(s.file_path)return`${e}(${s.file_path})`;if(s.notebook_path)return`${e}(${s.notebook_path})`;if(e==="Glob"&&s.pattern)return`${e}(${s.pattern})`;if(e==="Grep"&&s.pattern)return`${e}(${s.pattern})`;if(s.url)return`${e}(${s.url})`;if(s.query)return`${e}(${s.query})`;if(e==="Task"){if(s.subagent_type)return`${e}(${s.subagent_type})`;if(s.description)return`${e}(${s.description})`}return e==="Skill"&&s.skill?`${e}(${s.skill})`:e==="LSP"&&s.operation?`${e}(${s.operation})`:e}formatTimestamp(e){let t=e.getFullYear(),s=String(e.getMonth()+1).padStart(2,"0"),n=String(e.getDate()).padStart(2,"0"),o=String(e.getHours()).padStart(2,"0"),i=String(e.getMinutes()).padStart(2,"0"),a=String(e.getSeconds()).padStart(2,"0"),d=String(e.getMilliseconds()).padStart(3,"0");return`${t}-${s}-${n} ${o}:${i}:${a}.${d}`}log(e,t,s,n,o){if(e<this.getLevel())return;this.ensureLogFileInitialized();let i=this.formatTimestamp(new Date),a=re[e].padEnd(5),d=t.padEnd(6),u="";n?.correlationId?u=`[${n.correlationId}] `:n?.sessionId&&(u=`[session-${n.sessionId}] `);let c="";if(o!=null)if(o instanceof Error)c=this.getLevel()===0?`
${o.message}
${o.stack}`:` ${o.message}`;else if(this.getLevel()===0&&typeof o=="object")try{c=`
`+JSON.stringify(o,null,2)}catch{c=" "+this.formatData(o)}else c=" "+this.formatData(o);let l="";if(n){let{sessionId:g,memorySessionId:S,correlationId:R,...m}=n;Object.keys(m).length>0&&(l=` {${Object.entries(m).map(([h,f])=>`${h}=${f}`).join(", ")}}`)}let p=`[${i}] [${a}] [${d}] ${u}${s}${l}${c}`;if(this.logFilePath)try{(0,L.appendFileSync)(this.logFilePath,p+`
`,"utf8")}catch(g){process.stderr.write(`[LOGGER] Failed to write to log file: ${g instanceof Error?g.message:String(g)}
`)}else process.stderr.write(p+`
`)}debug(e,t,s,n){this.log(0,e,t,s,n)}info(e,t,s,n){this.log(1,e,t,s,n)}warn(e,t,s,n){this.log(2,e,t,s,n)}error(e,t,s,n){this.log(3,e,t,s,n)}dataIn(e,t,s,n){this.info(e,`\u2192 ${t}`,s,n)}dataOut(e,t,s,n){this.info(e,`\u2190 ${t}`,s,n)}success(e,t,s,n){this.info(e,`\u2713 ${t}`,s,n)}failure(e,t,s,n){this.error(e,`\u2717 ${t}`,s,n)}timing(e,t,s,n){this.info(e,`\u23F1 ${t}`,n,{duration:`${s}ms`})}happyPathError(e,t,s,n,o=""){let u=((new Error().stack||"").split(`
`)[2]||"").match(/at\s+(?:.*\s+)?\(?([^:]+):(\d+):(\d+)\)?/),c=u?`${u[1].split("/").pop()}:${u[2]}`:"unknown",l={...s,location:c};return this.warn(e,`[HAPPY-PATH] ${t}`,l,n),o}},E=new ne;var Pe=require("crypto");var xe=require("crypto"),ke=require("os"),oe=U(require("path"),1);var X=require("fs"),G=U(require("path"),1),k={isWorktree:!1,parentRepoPath:null};function ve(r){let e=G.default.join(r,".git"),t;try{t=(0,X.statSync)(e)}catch(u){return u instanceof Error&&u.code!=="ENOENT"&&console.warn("[worktree] Unexpected error checking .git:",u),k}if(!t.isFile())return k;let s;try{s=(0,X.readFileSync)(e,"utf-8").trim()}catch(u){return console.warn("[worktree] Failed to read .git file:",u instanceof Error?u.message:String(u)),k}let n=s.match(/^gitdir:\s*(.+)$/);if(!n)return k;let o=n[1],a=(G.default.isAbsolute(o)?o:G.default.resolve(r,o)).match(/^(.+)[/\\]\.git[/\\]worktrees[/\\]([^/\\]+)$/);return a?{isWorktree:!0,parentRepoPath:a[1]}:k}var zt=160;function Zt(r){return r==="~"||r.startsWith("~/")?r.replace(/^~/,(0,ke.homedir)()):r}function we(r){let e=Zt(r);return/^[A-Za-z]:([\\/].*)?$/.test(e)?oe.default.win32.resolve(e):oe.default.resolve(e)}function Fe(r){let e=r.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g,"-").replace(/-+/g,"-").replace(/^[._-]+|[._-]+$/g,"").slice(0,zt).replace(/[._-]+$/g,""),t=(0,xe.createHash)("sha1").update(r).digest("hex").slice(0,12);return`${e||"project"}-${t}`}var ye=new Map;function es(r){if(!r||r.trim()==="")return E.warn("PROJECT_NAME","Empty cwd provided, using fallback",{cwd:r}),"unknown-project";let e=we(r),t=ye.get(e);if(t)return t;let s=Fe(e);return ye.set(e,s),s}var ts={primary:"unknown-project",parent:null,isWorktree:!1,allProjects:["unknown-project"]},Ue=new Map;function ie(r){if(!r||r.trim()==="")return ts;let e=we(r),t=Ue.get(e);if(t)return t;let s=Fe(e),n=ve(e),o;if(n.isWorktree&&n.parentRepoPath){let i=es(n.parentRepoPath);o={primary:s,parent:i,isWorktree:!0,allProjects:[i,s]}}else o={primary:s,parent:null,isWorktree:!1,allProjects:[s]};return Ue.set(e,o),o}function B(r,e,t){return(0,Pe.createHash)("sha256").update([r||"",e||"",t||""].join("\0")).digest("hex").slice(0,16)}function ae(r){if(!r)return[];try{let e=JSON.parse(r);return Array.isArray(e)?e:[String(e)]}catch{return[r]}}var C="claude";function ss(r){return r.trim().toLowerCase().replace(/\s+/g,"-")}function y(r){if(!r)return C;let e=ss(r);return e?e==="transcript"||e.includes("codex")?"codex":e.includes("cursor")?"cursor":e.includes("claude")?"claude":e:C}function $e(r){let e=["claude","codex","cursor"];return[...r].sort((t,s)=>{let n=e.indexOf(t),o=e.indexOf(s);return n!==-1||o!==-1?n===-1?1:o===-1?-1:n-o:t.localeCompare(s)})}function rs(r,e){return{customTitle:r,platformSource:e?y(e):void 0}}function He(){let r=process.env.CLAUDE_MEM_NODE_ROLE;if(r&&r.trim())return r.trim().toLowerCase()==="server";try{if((0,V.existsSync)(te)){let e=JSON.parse((0,V.readFileSync)(te,"utf-8")),t=e?.env??e??{};return(typeof t.CLAUDE_MEM_NODE_ROLE=="string"?t.CLAUDE_MEM_NODE_ROLE.trim().toLowerCase():"")==="server"}}catch{}return!1}var W=class{db;constructor(e=Ne){e instanceof de.Database?this.db=e:(e!==":memory:"&&Le(b),this.db=new de.Database(e),this.db.run("PRAGMA journal_mode = WAL"),this.db.run("PRAGMA synchronous = NORMAL"),this.db.run("PRAGMA foreign_keys = ON"),this.db.run("PRAGMA journal_size_limit = 4194304")),this.initializeSchema(),this.ensureWorkerPortColumn(),this.ensurePromptTrackingColumns(),this.removeSessionSummariesUniqueConstraint(),this.addObservationHierarchicalFields(),this.makeObservationsTextNullable(),this.createUserPromptsTable(),this.ensureDiscoveryTokensColumn(),this.createPendingMessagesTable(),this.renameSessionIdColumns(),this.repairSessionIdColumnRename(),this.addFailedAtEpochColumn(),this.addOnUpdateCascadeToForeignKeys(),this.addObservationContentHashColumn(),this.addSessionCustomTitleColumn(),this.addSessionPlatformSourceColumn(),this.addObservationModelColumns(),this.ensureMergedIntoProjectColumns(),this.addObservationSubagentColumns(),this.addObservationsUniqueContentHashIndex(),this.addObservationsMetadataColumn(),this.dropDeadPendingMessagesColumns(),this.ensurePendingMessagesToolUseIdColumn(),this.dropWorkerPidColumn(),this.addSessionUserNameColumn(),this.addSessionUserLabelColumn(),this.createSyncInboxTable(),this.addApiKeysUserLabelColumn()}addApiKeysUserLabelColumn(){if(!He()||this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(38)||!this.db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='api_keys'").get())return;this.db.query("PRAGMA table_info(api_keys)").all().some(o=>o.name==="bound_user_label")||(this.db.run("ALTER TABLE api_keys ADD COLUMN bound_user_label TEXT"),this.db.run("CREATE INDEX IF NOT EXISTS idx_api_keys_bound_user ON api_keys(bound_user_label)"),E.debug("DB","Added bound_user_label column + idx_api_keys_bound_user to api_keys")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(38,new Date().toISOString())}createSyncInboxTable(){!He()||this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(37)&&this.db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_inbox'").get()||(this.db.run(`
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
    `),this.db.run("CREATE INDEX IF NOT EXISTS idx_sync_inbox_user_time ON sync_inbox(user_label, applied_at_epoch DESC)"),E.debug("DB","Created sync_inbox table + idx_sync_inbox_user_time (server mode)"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(37,new Date().toISOString()))}addSessionUserNameColumn(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(35))return;this.db.query("PRAGMA table_info(sdk_sessions)").all().some(n=>n.name==="user_name")||(this.db.run("ALTER TABLE sdk_sessions ADD COLUMN user_name TEXT"),E.debug("DB","Added user_name column to sdk_sessions table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(35,new Date().toISOString())}addSessionUserLabelColumn(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(36))return;this.db.query("PRAGMA table_info(sdk_sessions)").all().some(n=>n.name==="user_label")||(this.db.run("ALTER TABLE sdk_sessions ADD COLUMN user_label TEXT"),this.db.run("CREATE INDEX IF NOT EXISTS idx_sdk_sessions_user ON sdk_sessions(user_label)"),E.debug("DB","Added user_label column + idx_sdk_sessions_user to sdk_sessions")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(36,new Date().toISOString())}dropWorkerPidColumn(){let e=this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(32),s=this.db.query("PRAGMA table_info(pending_messages)").all().some(n=>n.name==="worker_pid");if(!(e&&!s)){if(s)try{this.db.run("DROP INDEX IF EXISTS idx_pending_messages_worker_pid"),this.db.run("ALTER TABLE pending_messages DROP COLUMN worker_pid"),E.debug("DB","Dropped worker_pid column and its index from pending_messages")}catch(n){E.warn("DB","Failed to drop worker_pid column from pending_messages",{},n instanceof Error?n:new Error(String(n)));return}e||this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(32,new Date().toISOString())}}dropDeadPendingMessagesColumns(){let e=this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(31),t=this.db.query("PRAGMA table_info(pending_messages)").all(),s=new Set(t.map(i=>i.name)),o=["retry_count","failed_at_epoch","completed_at_epoch"].filter(i=>s.has(i));if(!(e&&o.length===0)){if(o.length>0){this.db.run("BEGIN TRANSACTION");try{this.db.run("DELETE FROM pending_messages WHERE status NOT IN ('pending', 'processing')");for(let i of o)this.db.run(`ALTER TABLE pending_messages DROP COLUMN ${i}`),E.debug("DB",`Dropped dead column ${i} from pending_messages`);e||this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(31,new Date().toISOString()),this.db.run("COMMIT")}catch(i){this.db.run("ROLLBACK"),E.warn("DB","Failed to drop dead columns from pending_messages",{},i instanceof Error?i:new Error(String(i)));return}return}e||this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(31,new Date().toISOString())}}initializeSchema(){this.db.run(`
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
    `),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(4,new Date().toISOString())}ensureWorkerPortColumn(){this.db.query("PRAGMA table_info(sdk_sessions)").all().some(s=>s.name==="worker_port")||(this.db.run("ALTER TABLE sdk_sessions ADD COLUMN worker_port INTEGER"),E.debug("DB","Added worker_port column to sdk_sessions table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(5,new Date().toISOString())}ensurePromptTrackingColumns(){this.db.query("PRAGMA table_info(sdk_sessions)").all().some(a=>a.name==="prompt_counter")||(this.db.run("ALTER TABLE sdk_sessions ADD COLUMN prompt_counter INTEGER DEFAULT 0"),E.debug("DB","Added prompt_counter column to sdk_sessions table")),this.db.query("PRAGMA table_info(observations)").all().some(a=>a.name==="prompt_number")||(this.db.run("ALTER TABLE observations ADD COLUMN prompt_number INTEGER"),E.debug("DB","Added prompt_number column to observations table")),this.db.query("PRAGMA table_info(session_summaries)").all().some(a=>a.name==="prompt_number")||(this.db.run("ALTER TABLE session_summaries ADD COLUMN prompt_number INTEGER"),E.debug("DB","Added prompt_number column to session_summaries table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(6,new Date().toISOString())}removeSessionSummariesUniqueConstraint(){if(!this.db.query("PRAGMA index_list(session_summaries)").all().some(s=>s.unique===1&&s.origin!=="pk")){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(7,new Date().toISOString());return}E.debug("DB","Removing UNIQUE constraint from session_summaries.memory_session_id"),this.db.run("BEGIN TRANSACTION"),this.db.run("DROP TABLE IF EXISTS session_summaries_new"),this.db.run(`
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
    `),this.db.run("COMMIT"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(7,new Date().toISOString()),E.debug("DB","Successfully removed UNIQUE constraint from session_summaries.memory_session_id")}addObservationHierarchicalFields(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(8))return;if(this.db.query("PRAGMA table_info(observations)").all().some(n=>n.name==="title")){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(8,new Date().toISOString());return}E.debug("DB","Adding hierarchical fields to observations table"),this.db.run(`
      ALTER TABLE observations ADD COLUMN title TEXT;
      ALTER TABLE observations ADD COLUMN subtitle TEXT;
      ALTER TABLE observations ADD COLUMN facts TEXT;
      ALTER TABLE observations ADD COLUMN narrative TEXT;
      ALTER TABLE observations ADD COLUMN concepts TEXT;
      ALTER TABLE observations ADD COLUMN files_read TEXT;
      ALTER TABLE observations ADD COLUMN files_modified TEXT;
    `),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(8,new Date().toISOString()),E.debug("DB","Successfully added hierarchical fields to observations table")}makeObservationsTextNullable(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(9))return;let s=this.db.query("PRAGMA table_info(observations)").all().find(n=>n.name==="text");if(!s||s.notnull===0){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(9,new Date().toISOString());return}E.debug("DB","Making observations.text nullable"),this.db.run("BEGIN TRANSACTION"),this.db.run("DROP TABLE IF EXISTS observations_new"),this.db.run(`
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
    `),this.db.run("COMMIT"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(9,new Date().toISOString()),E.debug("DB","Successfully made observations.text nullable")}createUserPromptsTable(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(10))return;if(this.db.query("PRAGMA table_info(user_prompts)").all().length>0){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(10,new Date().toISOString());return}E.debug("DB","Creating user_prompts table with FTS5 support"),this.db.run("BEGIN TRANSACTION"),this.db.run(`
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
    `;try{this.db.run(s),this.db.run(n)}catch(o){o instanceof Error?E.warn("DB","FTS5 not available \u2014 user_prompts_fts skipped (search uses ChromaDB)",{},o):E.warn("DB","FTS5 not available \u2014 user_prompts_fts skipped (search uses ChromaDB)",{},new Error(String(o))),this.db.run("COMMIT"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(10,new Date().toISOString()),E.debug("DB","Created user_prompts table (without FTS5)");return}this.db.run("COMMIT"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(10,new Date().toISOString()),E.debug("DB","Successfully created user_prompts table")}ensureDiscoveryTokensColumn(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(11))return;this.db.query("PRAGMA table_info(observations)").all().some(i=>i.name==="discovery_tokens")||(this.db.run("ALTER TABLE observations ADD COLUMN discovery_tokens INTEGER DEFAULT 0"),E.debug("DB","Added discovery_tokens column to observations table")),this.db.query("PRAGMA table_info(session_summaries)").all().some(i=>i.name==="discovery_tokens")||(this.db.run("ALTER TABLE session_summaries ADD COLUMN discovery_tokens INTEGER DEFAULT 0"),E.debug("DB","Added discovery_tokens column to session_summaries table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(11,new Date().toISOString())}createPendingMessagesTable(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(16))return;if(this.db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='pending_messages'").all().length>0){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(16,new Date().toISOString());return}E.debug("DB","Creating pending_messages table"),this.db.run(`
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
    `),this.db.run("CREATE INDEX IF NOT EXISTS idx_pending_messages_session ON pending_messages(session_db_id)"),this.db.run("CREATE INDEX IF NOT EXISTS idx_pending_messages_status ON pending_messages(status)"),this.db.run("CREATE INDEX IF NOT EXISTS idx_pending_messages_claude_session ON pending_messages(content_session_id)"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(16,new Date().toISOString()),E.debug("DB","pending_messages table created successfully")}renameSessionIdColumns(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(17))return;E.debug("DB","Checking session ID columns for semantic clarity rename");let t=0,s=(n,o,i)=>{let a=this.db.query(`PRAGMA table_info(${n})`).all(),d=a.some(c=>c.name===o);return a.some(c=>c.name===i)?!1:d?(this.db.run(`ALTER TABLE ${n} RENAME COLUMN ${o} TO ${i}`),E.debug("DB",`Renamed ${n}.${o} to ${i}`),!0):(E.warn("DB",`Column ${o} not found in ${n}, skipping rename`),!1)};s("sdk_sessions","claude_session_id","content_session_id")&&t++,s("sdk_sessions","sdk_session_id","memory_session_id")&&t++,s("pending_messages","claude_session_id","content_session_id")&&t++,s("observations","sdk_session_id","memory_session_id")&&t++,s("session_summaries","sdk_session_id","memory_session_id")&&t++,s("user_prompts","claude_session_id","content_session_id")&&t++,this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(17,new Date().toISOString()),t>0?E.debug("DB",`Successfully renamed ${t} session ID columns`):E.debug("DB","No session ID column renames needed (already up to date)")}repairSessionIdColumnRename(){this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(19)||this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(19,new Date().toISOString())}addFailedAtEpochColumn(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(20))return;this.db.query("PRAGMA table_info(pending_messages)").all().some(n=>n.name==="failed_at_epoch")||(this.db.run("ALTER TABLE pending_messages ADD COLUMN failed_at_epoch INTEGER"),E.debug("DB","Added failed_at_epoch column to pending_messages table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(20,new Date().toISOString())}addOnUpdateCascadeToForeignKeys(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(21))return;E.debug("DB","Adding ON UPDATE CASCADE to FK constraints on observations and session_summaries"),this.db.run("PRAGMA foreign_keys = OFF"),this.db.run("BEGIN TRANSACTION"),this.db.run("DROP TRIGGER IF EXISTS observations_ai"),this.db.run("DROP TRIGGER IF EXISTS observations_ad"),this.db.run("DROP TRIGGER IF EXISTS observations_au"),this.db.run("DROP TABLE IF EXISTS observations_new");let s=this.db.query("PRAGMA table_info(observations)").all().some(S=>S.name==="metadata"),n=s?`,
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
    `,d=`
      CREATE INDEX idx_observations_sdk_session ON observations(memory_session_id);
      CREATE INDEX idx_observations_project ON observations(project);
      CREATE INDEX idx_observations_type ON observations(type);
      CREATE INDEX idx_observations_created ON observations(created_at_epoch DESC);
    `,u=`
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
    `;this.db.run("DROP TRIGGER IF EXISTS session_summaries_ai"),this.db.run("DROP TRIGGER IF EXISTS session_summaries_ad"),this.db.run("DROP TRIGGER IF EXISTS session_summaries_au"),this.db.run("DROP TABLE IF EXISTS session_summaries_new");let c=`
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
    `,l=`
      INSERT INTO session_summaries_new
      SELECT id, memory_session_id, project, request, investigated, learned,
             completed, next_steps, files_read, files_edited, notes,
             prompt_number, discovery_tokens, created_at, created_at_epoch
      FROM session_summaries
    `,p=`
      CREATE INDEX idx_session_summaries_sdk_session ON session_summaries(memory_session_id);
      CREATE INDEX idx_session_summaries_project ON session_summaries(project);
      CREATE INDEX idx_session_summaries_created ON session_summaries(created_at_epoch DESC);
    `,g=`
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
    `;try{this.recreateObservationsWithCascade(i,a,d,u),this.recreateSessionSummariesWithCascade(c,l,p,g),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(21,new Date().toISOString()),this.db.run("COMMIT"),this.db.run("PRAGMA foreign_keys = ON"),E.debug("DB","Successfully added ON UPDATE CASCADE to FK constraints")}catch(S){throw this.db.run("ROLLBACK"),this.db.run("PRAGMA foreign_keys = ON"),S instanceof Error?S:new Error(String(S))}}recreateObservationsWithCascade(e,t,s,n){this.db.run(e),this.db.run(t),this.db.run("DROP TABLE observations"),this.db.run("ALTER TABLE observations_new RENAME TO observations"),this.db.run(s),this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='observations_fts'").all().length>0&&this.db.run(n)}recreateSessionSummariesWithCascade(e,t,s,n){this.db.run(e),this.db.run(t),this.db.run("DROP TABLE session_summaries"),this.db.run("ALTER TABLE session_summaries_new RENAME TO session_summaries"),this.db.run(s),this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='session_summaries_fts'").all().length>0&&this.db.run(n)}addObservationContentHashColumn(){if(this.db.query("PRAGMA table_info(observations)").all().some(s=>s.name==="content_hash")){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(22,new Date().toISOString());return}this.db.run("ALTER TABLE observations ADD COLUMN content_hash TEXT"),this.db.run("UPDATE observations SET content_hash = substr(hex(randomblob(8)), 1, 16) WHERE content_hash IS NULL"),this.db.run("CREATE INDEX IF NOT EXISTS idx_observations_content_hash ON observations(content_hash, created_at_epoch)"),E.debug("DB","Added content_hash column to observations table with backfill and index"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(22,new Date().toISOString())}addSessionCustomTitleColumn(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(23))return;this.db.query("PRAGMA table_info(sdk_sessions)").all().some(n=>n.name==="custom_title")||(this.db.run("ALTER TABLE sdk_sessions ADD COLUMN custom_title TEXT"),E.debug("DB","Added custom_title column to sdk_sessions table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(23,new Date().toISOString())}addSessionPlatformSourceColumn(){let t=this.db.query("PRAGMA table_info(sdk_sessions)").all().some(i=>i.name==="platform_source"),n=this.db.query("PRAGMA index_list(sdk_sessions)").all().some(i=>i.name==="idx_sdk_sessions_platform_source");this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(24)&&t&&n||(t||(this.db.run(`ALTER TABLE sdk_sessions ADD COLUMN platform_source TEXT NOT NULL DEFAULT '${C}'`),E.debug("DB","Added platform_source column to sdk_sessions table")),this.db.run(`
      UPDATE sdk_sessions
      SET platform_source = '${C}'
      WHERE platform_source IS NULL OR platform_source = ''
    `),n||this.db.run("CREATE INDEX IF NOT EXISTS idx_sdk_sessions_platform_source ON sdk_sessions(platform_source)"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(24,new Date().toISOString()))}addObservationModelColumns(){let e=this.db.query("PRAGMA table_info(observations)").all(),t=e.some(n=>n.name==="generated_by_model"),s=e.some(n=>n.name==="relevance_count");t&&s||(t||this.db.run("ALTER TABLE observations ADD COLUMN generated_by_model TEXT"),s||this.db.run("ALTER TABLE observations ADD COLUMN relevance_count INTEGER DEFAULT 0"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(26,new Date().toISOString()))}ensureMergedIntoProjectColumns(){this.db.query("PRAGMA table_info(observations)").all().some(s=>s.name==="merged_into_project")||this.db.run("ALTER TABLE observations ADD COLUMN merged_into_project TEXT"),this.db.run("CREATE INDEX IF NOT EXISTS idx_observations_merged_into ON observations(merged_into_project)"),this.db.query("PRAGMA table_info(session_summaries)").all().some(s=>s.name==="merged_into_project")||this.db.run("ALTER TABLE session_summaries ADD COLUMN merged_into_project TEXT"),this.db.run("CREATE INDEX IF NOT EXISTS idx_summaries_merged_into ON session_summaries(merged_into_project)")}addObservationSubagentColumns(){let e=this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(27),t=this.db.query("PRAGMA table_info(observations)").all(),s=t.some(i=>i.name==="agent_type"),n=t.some(i=>i.name==="agent_id");s||this.db.run("ALTER TABLE observations ADD COLUMN agent_type TEXT"),n||this.db.run("ALTER TABLE observations ADD COLUMN agent_id TEXT"),this.db.run("CREATE INDEX IF NOT EXISTS idx_observations_agent_type ON observations(agent_type)"),this.db.run("CREATE INDEX IF NOT EXISTS idx_observations_agent_id ON observations(agent_id)");let o=this.db.query("PRAGMA table_info(pending_messages)").all();if(o.length>0){let i=o.some(d=>d.name==="agent_type"),a=o.some(d=>d.name==="agent_id");i||this.db.run("ALTER TABLE pending_messages ADD COLUMN agent_type TEXT"),a||this.db.run("ALTER TABLE pending_messages ADD COLUMN agent_id TEXT")}e||this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(27,new Date().toISOString())}ensurePendingMessagesToolUseIdColumn(){if(this.db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='pending_messages'").all().length===0){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(28,new Date().toISOString());return}this.db.query("PRAGMA table_info(pending_messages)").all().some(n=>n.name==="tool_use_id")||this.db.run("ALTER TABLE pending_messages ADD COLUMN tool_use_id TEXT"),this.db.run("BEGIN TRANSACTION");try{this.db.run(`
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
      `),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(29,new Date().toISOString()),this.db.run("COMMIT")}catch(o){throw this.db.run("ROLLBACK"),o}}addObservationsMetadataColumn(){this.db.query("PRAGMA table_info(observations)").all().some(s=>s.name==="metadata")||(this.db.run("ALTER TABLE observations ADD COLUMN metadata TEXT"),E.debug("DB","Added metadata column to observations table (#2116)")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(30,new Date().toISOString())}updateMemorySessionId(e,t){this.db.prepare(`
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
      `).run(t,e),E.info("DB","Registered memory_session_id before storage (FK fix)",{sessionDbId:e,oldId:s.memory_session_id,newId:t}))}getRecentSummaries(e,t=10){return this.db.prepare(`
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
        COALESCE(s.platform_source, '${C}') as platform_source,
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
        COALESCE(s.platform_source, '${C}') as platform_source,
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
        COALESCE(s.platform_source, '${C}') as platform_source,
        up.prompt_number,
        up.prompt_text,
        up.created_at,
        up.created_at_epoch
      FROM user_prompts up
      LEFT JOIN sdk_sessions s ON up.content_session_id = s.content_session_id
      ORDER BY up.created_at_epoch DESC
      LIMIT ?
    `).all(e)}getAllProjects(e){let t=e?y(e):void 0,s=`
      SELECT DISTINCT project
      FROM sdk_sessions
      WHERE project IS NOT NULL AND project != ''
        AND project != ?
    `,n=[se];return t&&(s+=" AND COALESCE(platform_source, ?) = ?",n.push(C,t)),s+=" ORDER BY project ASC",this.db.prepare(s).all(...n).map(i=>i.project)}getProjectCatalog(){let e=this.db.prepare(`
      SELECT
        COALESCE(platform_source, '${C}') as platform_source,
        project,
        MAX(started_at_epoch) as latest_epoch
      FROM sdk_sessions
      WHERE project IS NOT NULL AND project != ''
        AND project != ?
      GROUP BY COALESCE(platform_source, '${C}'), project
      ORDER BY latest_epoch DESC
    `).all(se),t=[],s=new Set,n={};for(let i of e){let a=y(i.platform_source);n[a]||(n[a]=[]),n[a].includes(i.project)||n[a].push(i.project),s.has(i.project)||(s.add(i.project),t.push(i.project))}let o=$e(Object.keys(n));return{projects:t,sources:o,projectsBySource:Object.fromEntries(o.map(i=>[i,n[i]||[]]))}}getLatestUserPrompt(e){return this.db.prepare(`
      SELECT
        up.*,
        s.memory_session_id,
        s.project,
        COALESCE(s.platform_source, '${C}') as platform_source
      FROM user_prompts up
      JOIN sdk_sessions s ON up.content_session_id = s.content_session_id
      WHERE up.content_session_id = ?
      ORDER BY up.created_at_epoch DESC
      LIMIT 1
    `).get(e)}getRecentSessionsWithStatus(e,t=3){return this.db.prepare(`
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
    `).get(e)||null}getObservationsByIds(e,t={}){if(e.length===0)return[];let{orderBy:s="date_desc",limit:n,project:o,type:i,concepts:a,files:d}=t,u=s==="relevance",c=u?"":`ORDER BY created_at_epoch ${s==="date_asc"?"ASC":"DESC"}`,l=n?`LIMIT ${n}`:"",p=e.map(()=>"?").join(","),g=[...e],S=[];if(o&&(S.push("project = ?"),g.push(o)),i)if(Array.isArray(i)){let f=i.map(()=>"?").join(",");S.push(`type IN (${f})`),g.push(...i)}else S.push("type = ?"),g.push(i);if(a){let f=Array.isArray(a)?a:[a],O=f.map(()=>"EXISTS (SELECT 1 FROM json_each(concepts) WHERE value = ?)");g.push(...f),S.push(`(${O.join(" OR ")})`)}if(d){let f=Array.isArray(d)?d:[d],O=f.map(()=>"(EXISTS (SELECT 1 FROM json_each(files_read) WHERE value LIKE ?) OR EXISTS (SELECT 1 FROM json_each(files_modified) WHERE value LIKE ?))");f.forEach(M=>{g.push(`%${M}%`,`%${M}%`)}),S.push(`(${O.join(" OR ")})`)}let R=S.length>0?`WHERE id IN (${p}) AND ${S.join(" AND ")}`:`WHERE id IN (${p})`,A=this.db.prepare(`
      SELECT *
      FROM observations
      ${R}
      ${c}
      ${l}
    `).all(...g);if(!u)return A;let h=new Map(A.map(f=>[f.id,f]));return e.map(f=>h.get(f)).filter(f=>!!f)}getSummaryForSession(e){return this.db.prepare(`
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
    `).all(e),n=new Set,o=new Set;for(let i of s)ae(i.files_read).forEach(a=>n.add(a)),ae(i.files_modified).forEach(a=>o.add(a));return{filesRead:Array.from(n),filesModified:Array.from(o)}}getSessionById(e){return this.db.prepare(`
      SELECT id, content_session_id, memory_session_id, project,
             COALESCE(platform_source, '${C}') as platform_source,
             user_prompt, custom_title, status
      FROM sdk_sessions
      WHERE id = ?
      LIMIT 1
    `).get(e)||null}getSdkSessionsBySessionIds(e){if(e.length===0)return[];let t=e.map(()=>"?").join(",");return this.db.prepare(`
      SELECT id, content_session_id, memory_session_id, project,
             COALESCE(platform_source, '${C}') as platform_source,
             user_prompt, custom_title,
             started_at, started_at_epoch, completed_at, completed_at_epoch, status
      FROM sdk_sessions
      WHERE memory_session_id IN (${t})
      ORDER BY started_at_epoch DESC
    `).all(...e)}getPromptNumberFromUserPrompts(e){return this.db.prepare(`
      SELECT COUNT(*) as count FROM user_prompts WHERE content_session_id = ?
    `).get(e).count}createSDKSession(e,t,s,n,o){let i=new Date,a=i.getTime(),d=rs(n,o),u=d.platformSource??C,c=this.db.prepare(`
      SELECT id, platform_source FROM sdk_sessions WHERE content_session_id = ?
    `).get(e);if(c){if(t&&this.db.prepare(`
          UPDATE sdk_sessions SET project = ?
          WHERE content_session_id = ? AND (project IS NULL OR project = '')
        `).run(t,e),d.customTitle&&this.db.prepare(`
          UPDATE sdk_sessions SET custom_title = ?
          WHERE content_session_id = ? AND custom_title IS NULL
        `).run(d.customTitle,e),d.platformSource){let p=c.platform_source?.trim()?y(c.platform_source):void 0;if(!p)this.db.prepare(`
            UPDATE sdk_sessions SET platform_source = ?
            WHERE content_session_id = ?
              AND COALESCE(platform_source, '') = ''
          `).run(d.platformSource,e);else if(p!==d.platformSource)throw new Error(`Platform source conflict for session ${e}: existing=${p}, received=${d.platformSource}`)}return c.id}return this.db.prepare(`
      INSERT INTO sdk_sessions
      (content_session_id, memory_session_id, project, platform_source, user_prompt, custom_title, started_at, started_at_epoch, status)
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 'active')
    `).run(e,t,u,s,d.customTitle||null,i.toISOString(),a),this.db.prepare("SELECT id FROM sdk_sessions WHERE content_session_id = ?").get(e).id}saveUserPrompt(e,t,s){let n=new Date,o=n.getTime();return this.db.prepare(`
      INSERT INTO user_prompts
      (content_session_id, prompt_number, prompt_text, created_at, created_at_epoch)
      VALUES (?, ?, ?, ?, ?)
    `).run(e,t,s,n.toISOString(),o).lastInsertRowid}getUserPrompt(e,t){return this.db.prepare(`
      SELECT prompt_text
      FROM user_prompts
      WHERE content_session_id = ? AND prompt_number = ?
      LIMIT 1
    `).get(e,t)?.prompt_text??null}storeObservation(e,t,s,n,o=0,i,a){let d=i??Date.now(),u=new Date(d).toISOString(),c=B(e,s.title,s.narrative),p=this.db.prepare(`
      INSERT INTO observations
      (memory_session_id, project, type, title, subtitle, facts, narrative, concepts,
       files_read, files_modified, prompt_number, discovery_tokens, agent_type, agent_id, content_hash, created_at, created_at_epoch,
       generated_by_model, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(memory_session_id, content_hash) DO NOTHING
      RETURNING id, created_at_epoch
    `).get(e,t,s.type,s.title,s.subtitle,JSON.stringify(s.facts),s.narrative,JSON.stringify(s.concepts),JSON.stringify(s.files_read),JSON.stringify(s.files_modified),n||null,o,s.agent_type??null,s.agent_id??null,c,u,d,a||null,s.metadata??null);if(p)return{id:p.id,createdAtEpoch:p.created_at_epoch};let g=this.db.prepare("SELECT id, created_at_epoch FROM observations WHERE memory_session_id = ? AND content_hash = ?").get(e,c);if(!g)throw new Error(`storeObservation: ON CONFLICT without existing row for content_hash=${c}`);return{id:g.id,createdAtEpoch:g.created_at_epoch}}storeSummary(e,t,s,n,o=0,i){let a=i??Date.now(),d=new Date(a).toISOString(),c=this.db.prepare(`
      INSERT INTO session_summaries
      (memory_session_id, project, request, investigated, learned, completed,
       next_steps, notes, prompt_number, discovery_tokens, created_at, created_at_epoch)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(e,t,s.request,s.investigated,s.learned,s.completed,s.next_steps,s.notes,n||null,o,d,a);return{id:Number(c.lastInsertRowid),createdAtEpoch:a}}storeObservations(e,t,s,n,o,i=0,a,d){let u=a??Date.now(),c=new Date(u).toISOString();return this.db.transaction(()=>{let p=[],g=this.db.prepare(`
        INSERT INTO observations
        (memory_session_id, project, type, title, subtitle, facts, narrative, concepts,
         files_read, files_modified, prompt_number, discovery_tokens, agent_type, agent_id, content_hash, created_at, created_at_epoch,
         generated_by_model)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(memory_session_id, content_hash) DO NOTHING
        RETURNING id
      `),S=this.db.prepare("SELECT id FROM observations WHERE memory_session_id = ? AND content_hash = ?");for(let m of s){let A=B(e,m.title,m.narrative),h=g.get(e,t,m.type,m.title,m.subtitle,JSON.stringify(m.facts),m.narrative,JSON.stringify(m.concepts),JSON.stringify(m.files_read),JSON.stringify(m.files_modified),o||null,i,m.agent_type??null,m.agent_id??null,A,c,u,d||null);if(h){p.push(h.id);continue}let f=S.get(e,A);if(!f)throw new Error(`storeObservations: ON CONFLICT without existing row for content_hash=${A}`);p.push(f.id)}let R=null;if(n){let A=this.db.prepare(`
          INSERT INTO session_summaries
          (memory_session_id, project, request, investigated, learned, completed,
           next_steps, notes, prompt_number, discovery_tokens, created_at, created_at_epoch)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(e,t,n.request,n.investigated,n.learned,n.completed,n.next_steps,n.notes,o||null,i,c,u);R=Number(A.lastInsertRowid)}return{observationIds:p,summaryId:R,createdAtEpoch:u}})()}storeObservationsAndMarkComplete(e,t,s,n,o,i,a,d=0,u,c){let l=u??Date.now(),p=new Date(l).toISOString();return this.db.transaction(()=>{let S=[],R=this.db.prepare(`
        INSERT INTO observations
        (memory_session_id, project, type, title, subtitle, facts, narrative, concepts,
         files_read, files_modified, prompt_number, discovery_tokens, agent_type, agent_id, content_hash, created_at, created_at_epoch,
         generated_by_model)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(memory_session_id, content_hash) DO NOTHING
        RETURNING id
      `),m=this.db.prepare("SELECT id FROM observations WHERE memory_session_id = ? AND content_hash = ?");for(let O of s){let M=B(e,O.title,O.narrative),he=R.get(e,t,O.type,O.title,O.subtitle,JSON.stringify(O.facts),O.narrative,JSON.stringify(O.concepts),JSON.stringify(O.files_read),JSON.stringify(O.files_modified),a||null,d,O.agent_type??null,O.agent_id??null,M,p,l,c||null);if(he){S.push(he.id);continue}let Oe=m.get(e,M);if(!Oe)throw new Error(`storeObservationsAndMarkComplete: ON CONFLICT without existing row for content_hash=${M}`);S.push(Oe.id)}let A;if(n){let M=this.db.prepare(`
          INSERT INTO session_summaries
          (memory_session_id, project, request, investigated, learned, completed,
           next_steps, notes, prompt_number, discovery_tokens, created_at, created_at_epoch)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(e,t,n.request,n.investigated,n.learned,n.completed,n.next_steps,n.notes,a||null,d,p,l);A=Number(M.lastInsertRowid)}if(this.db.prepare(`
        DELETE FROM pending_messages
        WHERE id = ? AND status = 'processing'
      `).run(o).changes!==1)throw new Error(`storeObservationsAndMarkComplete: failed to complete pending message ${o}`);return{observationIds:S,summaryId:A,createdAtEpoch:l}})()}getSessionSummariesByIds(e,t={}){if(e.length===0)return[];let{orderBy:s="date_desc",limit:n,project:o}=t,i=s==="relevance",a=i?"":`ORDER BY created_at_epoch ${s==="date_asc"?"ASC":"DESC"}`,d=n?`LIMIT ${n}`:"",u=e.map(()=>"?").join(","),c=[...e],l=o?`WHERE id IN (${u}) AND project = ?`:`WHERE id IN (${u})`;o&&c.push(o);let g=this.db.prepare(`
      SELECT * FROM session_summaries
      ${l}
      ${a}
      ${d}
    `).all(...c);if(!i)return g;let S=new Map(g.map(R=>[R.id,R]));return e.map(R=>S.get(R)).filter(R=>!!R)}getUserPromptsByIds(e,t={}){if(e.length===0)return[];let{orderBy:s="date_desc",limit:n,project:o}=t,i=s==="relevance",a=i?"":`ORDER BY up.created_at_epoch ${s==="date_asc"?"ASC":"DESC"}`,d=n?`LIMIT ${n}`:"",u=e.map(()=>"?").join(","),c=[...e],l=o?"AND s.project = ?":"";o&&c.push(o);let g=this.db.prepare(`
      SELECT
        up.*,
        s.project,
        s.memory_session_id
      FROM user_prompts up
      JOIN sdk_sessions s ON up.content_session_id = s.content_session_id
      WHERE up.id IN (${u}) ${l}
      ${a}
      ${d}
    `).all(...c);if(!i)return g;let S=new Map(g.map(R=>[R.id,R]));return e.map(R=>S.get(R)).filter(R=>!!R)}getTimelineAroundTimestamp(e,t=10,s=10,n){return this.getTimelineAroundObservation(null,e,t,s,n)}getTimelineAroundObservation(e,t,s=10,n=10,o){let i=o?"AND project = ?":"",a=o?[o]:[],d,u;if(e!==null){let m=`
        SELECT id, created_at_epoch
        FROM observations
        WHERE id <= ? ${i}
        ORDER BY id DESC
        LIMIT ?
      `,A=`
        SELECT id, created_at_epoch
        FROM observations
        WHERE id >= ? ${i}
        ORDER BY id ASC
        LIMIT ?
      `;try{let h=this.db.prepare(m).all(e,...a,s+1),f=this.db.prepare(A).all(e,...a,n+1);if(h.length===0&&f.length===0)return{observations:[],sessions:[],prompts:[]};d=h.length>0?h[h.length-1].created_at_epoch:t,u=f.length>0?f[f.length-1].created_at_epoch:t}catch(h){return h instanceof Error?E.error("DB","Error getting boundary observations",{project:o},h):E.error("DB","Error getting boundary observations with non-Error",{},new Error(String(h))),{observations:[],sessions:[],prompts:[]}}}else{let m=`
        SELECT created_at_epoch
        FROM observations
        WHERE created_at_epoch <= ? ${i}
        ORDER BY created_at_epoch DESC
        LIMIT ?
      `,A=`
        SELECT created_at_epoch
        FROM observations
        WHERE created_at_epoch >= ? ${i}
        ORDER BY created_at_epoch ASC
        LIMIT ?
      `;try{let h=this.db.prepare(m).all(t,...a,s),f=this.db.prepare(A).all(t,...a,n+1);if(h.length===0&&f.length===0)return{observations:[],sessions:[],prompts:[]};d=h.length>0?h[h.length-1].created_at_epoch:t,u=f.length>0?f[f.length-1].created_at_epoch:t}catch(h){return h instanceof Error?E.error("DB","Error getting boundary timestamps",{project:o},h):E.error("DB","Error getting boundary timestamps with non-Error",{},new Error(String(h))),{observations:[],sessions:[],prompts:[]}}}let c=`
      SELECT *
      FROM observations
      WHERE created_at_epoch >= ? AND created_at_epoch <= ? ${i}
      ORDER BY created_at_epoch ASC
    `,l=`
      SELECT *
      FROM session_summaries
      WHERE created_at_epoch >= ? AND created_at_epoch <= ? ${i}
      ORDER BY created_at_epoch ASC
    `,p=`
      SELECT up.*, s.project, s.memory_session_id
      FROM user_prompts up
      JOIN sdk_sessions s ON up.content_session_id = s.content_session_id
      WHERE up.created_at_epoch >= ? AND up.created_at_epoch <= ? ${i.replace("project","s.project")}
      ORDER BY up.created_at_epoch ASC
    `,g=this.db.prepare(c).all(d,u,...a),S=this.db.prepare(l).all(d,u,...a),R=this.db.prepare(p).all(d,u,...a);return{observations:g,sessions:S.map(m=>({id:m.id,memory_session_id:m.memory_session_id,project:m.project,request:m.request,completed:m.completed,next_steps:m.next_steps,created_at:m.created_at,created_at_epoch:m.created_at_epoch})),prompts:R.map(m=>({id:m.id,content_session_id:m.content_session_id,prompt_number:m.prompt_number,prompt_text:m.prompt_text,project:m.project,created_at:m.created_at,created_at_epoch:m.created_at_epoch}))}}getPromptById(e){return this.db.prepare(`
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
    `).run(t,s,e,C,o.toISOString(),o.getTime()),E.info("SESSION","Created manual session",{memorySessionId:t,project:e}),t}close(){this.db.close()}projectsWithPendingWork(e){let t=new Set;if(e.length===0)return t;let s=e.map(()=>"?").join(","),n=this.db.prepare(`
      SELECT DISTINCT s.project AS project
      FROM pending_messages pm
      JOIN sdk_sessions s ON pm.session_db_id = s.id
      WHERE s.project IN (${s})
        AND pm.status IN ('pending', 'processing')
    `).all(...e);for(let o of n)o.project&&t.add(o.project);return t}deleteProjectsCompletely(e){let t={};return e.length===0||(this.db.transaction(n=>{let o=n.map(()=>"?").join(",");for(let i of n){let a=this.db.prepare(`SELECT COUNT(*) AS n FROM observations
             WHERE project = ? OR merged_into_project = ?`).get(i,i),d=this.db.prepare(`SELECT COUNT(*) AS n FROM session_summaries
             WHERE project = ? OR merged_into_project = ?`).get(i,i),u=this.db.prepare("SELECT COUNT(*) AS n FROM sdk_sessions WHERE project = ?").get(i),c=this.db.prepare(`SELECT COUNT(*) AS n FROM user_prompts up
             JOIN sdk_sessions s ON up.content_session_id = s.content_session_id
             WHERE s.project = ?`).get(i),l=this.db.prepare(`SELECT COUNT(*) AS n FROM pending_messages pm
             JOIN sdk_sessions s ON pm.session_db_id = s.id
             WHERE s.project = ?`).get(i);t[i]={observations:a.n,summaries:d.n,sessions:u.n,prompts:c.n,pending:l.n}}this.db.prepare(`DELETE FROM observations
           WHERE project IN (${o})
              OR merged_into_project IN (${o})`).run(...n,...n),this.db.prepare(`DELETE FROM session_summaries
           WHERE project IN (${o})
              OR merged_into_project IN (${o})`).run(...n,...n),this.db.prepare(`DELETE FROM pending_messages
           WHERE session_db_id IN (
             SELECT id FROM sdk_sessions WHERE project IN (${o})
           )`).run(...n),this.db.prepare(`DELETE FROM user_prompts
           WHERE content_session_id IN (
             SELECT content_session_id FROM sdk_sessions WHERE project IN (${o})
           )`).run(...n),this.db.prepare(`DELETE FROM sdk_sessions WHERE project IN (${o})`).run(...n)})(e),E.info("SESSION","Projects deleted completely",{projects:e,counts:t})),t}importSdkSession(e){let t=this.db.prepare("SELECT id FROM sdk_sessions WHERE content_session_id = ?").get(e.content_session_id);return t?{imported:!1,id:t.id}:{imported:!0,id:this.db.prepare(`
      INSERT INTO sdk_sessions (
        content_session_id, memory_session_id, project, platform_source, user_prompt,
        started_at, started_at_epoch, completed_at, completed_at_epoch, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(e.content_session_id,e.memory_session_id,e.project,y(e.platform_source),e.user_prompt,e.started_at,e.started_at_epoch,e.completed_at,e.completed_at_epoch,e.status).lastInsertRowid}}importSessionSummary(e){let t=this.db.prepare("SELECT id FROM session_summaries WHERE memory_session_id = ?").get(e.memory_session_id);return t?{imported:!1,id:t.id}:{imported:!0,id:this.db.prepare(`
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
    `).run(e.content_session_id,e.prompt_number,e.prompt_text,e.created_at,e.created_at_epoch).lastInsertRowid}}};var I=require("fs"),w=require("path"),_e=require("os"),Y=class{static DEFAULTS={CLAUDE_MEM_MODEL:"claude-haiku-4-5-20251001",CLAUDE_MEM_CONTEXT_OBSERVATIONS:"50",CLAUDE_MEM_WORKER_PORT:String(37700+(process.getuid?.()??77)%100),CLAUDE_MEM_WORKER_HOST:"127.0.0.1",CLAUDE_MEM_SKIP_TOOLS:"ListMcpResourcesTool,SlashCommand,Skill,TodoWrite,AskUserQuestion",CLAUDE_MEM_PROVIDER:"claude",CLAUDE_MEM_CLAUDE_AUTH_METHOD:"subscription",CLAUDE_MEM_GEMINI_API_KEY:"",CLAUDE_MEM_GEMINI_MODEL:"gemini-2.5-flash-lite",CLAUDE_MEM_GEMINI_RATE_LIMITING_ENABLED:"true",CLAUDE_MEM_GEMINI_MAX_CONTEXT_MESSAGES:"20",CLAUDE_MEM_GEMINI_MAX_TOKENS:"100000",CLAUDE_MEM_OPENROUTER_API_KEY:"",CLAUDE_MEM_OPENROUTER_MODEL:"xiaomi/mimo-v2-flash:free",CLAUDE_MEM_OPENROUTER_SITE_URL:"",CLAUDE_MEM_OPENROUTER_APP_NAME:"claude-mem",CLAUDE_MEM_OPENROUTER_MAX_CONTEXT_MESSAGES:"20",CLAUDE_MEM_OPENROUTER_MAX_TOKENS:"100000",CLAUDE_MEM_DATA_DIR:(0,w.join)((0,_e.homedir)(),".claude-mem"),CLAUDE_MEM_LOG_LEVEL:"INFO",CLAUDE_MEM_PYTHON_VERSION:"3.13",CLAUDE_CODE_PATH:"",CLAUDE_MEM_MODE:"code",CLAUDE_MEM_CONTEXT_SHOW_READ_TOKENS:"false",CLAUDE_MEM_CONTEXT_SHOW_WORK_TOKENS:"false",CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_AMOUNT:"false",CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_PERCENT:"true",CLAUDE_MEM_CONTEXT_FULL_COUNT:"0",CLAUDE_MEM_CONTEXT_FULL_FIELD:"narrative",CLAUDE_MEM_CONTEXT_SESSION_COUNT:"10",CLAUDE_MEM_CONTEXT_SHOW_LAST_SUMMARY:"true",CLAUDE_MEM_CONTEXT_SHOW_LAST_MESSAGE:"false",CLAUDE_MEM_CONTEXT_SHOW_TERMINAL_OUTPUT:"true",CLAUDE_MEM_WELCOME_HINT_ENABLED:"true",CLAUDE_MEM_FOLDER_CLAUDEMD_ENABLED:"false",CLAUDE_MEM_FOLDER_USE_LOCAL_MD:"false",CLAUDE_MEM_TRANSCRIPTS_ENABLED:"true",CLAUDE_MEM_TRANSCRIPTS_CONFIG_PATH:(0,w.join)((0,_e.homedir)(),".claude-mem","transcript-watch.json"),CLAUDE_MEM_MAX_CONCURRENT_AGENTS:"2",CLAUDE_MEM_HOOK_FAIL_LOUD_THRESHOLD:"3",CLAUDE_MEM_EXCLUDED_PROJECTS:"",CLAUDE_MEM_FOLDER_MD_EXCLUDE:"[]",CLAUDE_MEM_SEMANTIC_INJECT:"false",CLAUDE_MEM_SEMANTIC_INJECT_LIMIT:"5",CLAUDE_MEM_TIER_ROUTING_ENABLED:"true",CLAUDE_MEM_TIER_SIMPLE_MODEL:"haiku",CLAUDE_MEM_TIER_SUMMARY_MODEL:"",CLAUDE_MEM_CHROMA_ENABLED:"true",CLAUDE_MEM_CHROMA_MODE:"local",CLAUDE_MEM_CHROMA_HOST:"127.0.0.1",CLAUDE_MEM_CHROMA_PORT:"8000",CLAUDE_MEM_CHROMA_SSL:"false",CLAUDE_MEM_CHROMA_API_KEY:"",CLAUDE_MEM_CHROMA_TENANT:"default_tenant",CLAUDE_MEM_CHROMA_DATABASE:"default_database",CLAUDE_MEM_TELEGRAM_ENABLED:"true",CLAUDE_MEM_TELEGRAM_BOT_TOKEN:"",CLAUDE_MEM_TELEGRAM_CHAT_ID:"",CLAUDE_MEM_TELEGRAM_TRIGGER_TYPES:"security_alert",CLAUDE_MEM_TELEGRAM_TRIGGER_CONCEPTS:"",CLAUDE_MEM_QUEUE_ENGINE:"sqlite",CLAUDE_MEM_REDIS_URL:"",CLAUDE_MEM_REDIS_HOST:"127.0.0.1",CLAUDE_MEM_REDIS_PORT:"6379",CLAUDE_MEM_REDIS_MODE:"external",CLAUDE_MEM_QUEUE_REDIS_PREFIX:`claude_mem_${process.env.CLAUDE_MEM_WORKER_PORT??String(37700+(process.getuid?.()??77)%100)}`,CLAUDE_MEM_AUTH_MODE:"api-key",CLAUDE_MEM_RUNTIME:"worker",CLAUDE_MEM_SERVER_BETA_URL:`http://127.0.0.1:${process.env.CLAUDE_MEM_SERVER_PORT??String(37877+(process.getuid?.()??77)%100)}`,CLAUDE_MEM_SERVER_BETA_API_KEY:"",CLAUDE_MEM_SERVER_BETA_PROJECT_ID:"",CLAUDE_MEM_NODE_ROLE:"client",CLAUDE_MEM_USER_LABEL:"",CLAUDE_MEM_SYNC_ENABLED:"true",CLAUDE_MEM_SYNC_UPSTREAM_URL:"",CLAUDE_MEM_SYNC_AUTH_MODE:"none",CLAUDE_MEM_SYNC_API_KEY:"",CLAUDE_MEM_SYNC_INTERVAL_MS:"30000",CLAUDE_MEM_SYNC_BATCH_SIZE:"200",CLAUDE_MEM_SYNC_RETRY_MAX:"8",CLAUDE_MEM_SYNC_REDACT_PATTERNS:"",CLAUDE_MEM_SERVER_BIND_HOST:"",CLAUDE_MEM_SERVER_AUTH_MODE:"none",CLAUDE_MEM_SERVER_TRUSTED_PROXIES:"127.0.0.1/32,::1/128",CLAUDE_MEM_SERVER_ALLOWED_USERS:"",CLAUDE_MEM_SERVER_INGEST_MAX_BATCH:"1000",CLAUDE_MEM_SERVER_REQUIRE_TLS:"false"};static getAllDefaults(){return{...this.DEFAULTS}}static get(e){return process.env[e]??this.DEFAULTS[e]}static getInt(e){let t=this.get(e);return parseInt(t,10)}static getBool(e){let t=this.get(e);return t==="true"||t===!0}static applyEnvOverrides(e){let t={...e};for(let s of Object.keys(this.DEFAULTS))process.env[s]!==void 0&&(t[s]=process.env[s]);return t}static loadFromFile(e){try{if(!(0,I.existsSync)(e)){let i=this.getAllDefaults();try{let a=(0,w.dirname)(e);(0,I.existsSync)(a)||(0,I.mkdirSync)(a,{recursive:!0}),(0,I.writeFileSync)(e,JSON.stringify(i,null,2),"utf-8"),console.log("[SETTINGS] Created settings file with defaults:",e)}catch(a){console.warn("[SETTINGS] Failed to create settings file, using in-memory defaults:",e,a instanceof Error?a.message:String(a))}return this.applyEnvOverrides(i)}let t=(0,I.readFileSync)(e,"utf-8"),s=JSON.parse(t),n=s;if(s.env&&typeof s.env=="object"){n=s.env;try{(0,I.writeFileSync)(e,JSON.stringify(n,null,2),"utf-8"),console.log("[SETTINGS] Migrated settings file from nested to flat schema:",e)}catch(i){console.warn("[SETTINGS] Failed to auto-migrate settings file:",e,i instanceof Error?i.message:String(i))}}let o={...this.DEFAULTS};for(let i of Object.keys(this.DEFAULTS))n[i]!==void 0&&(o[i]=n[i]);return this.applyEnvOverrides(o)}catch(t){return console.warn("[SETTINGS] Failed to load settings, using defaults:",e,t instanceof Error?t.message:String(t)),this.applyEnvOverrides(this.getAllDefaults())}}};var F=require("fs"),q=require("path");var N=class r{static instance=null;activeMode=null;modesDir;constructor(){let e=Me(),t=[(0,q.join)(e,"modes"),(0,q.join)(e,"..","plugin","modes")],s=t.find(n=>(0,F.existsSync)(n));this.modesDir=s||t[0]}static getInstance(){return r.instance||(r.instance=new r),r.instance}parseInheritance(e){let t=e.split("--");if(t.length===1)return{hasParent:!1,parentId:"",overrideId:""};if(t.length>2)throw new Error(`Invalid mode inheritance: ${e}. Only one level of inheritance supported (parent--override)`);return{hasParent:!0,parentId:t[0],overrideId:e}}isPlainObject(e){return e!==null&&typeof e=="object"&&!Array.isArray(e)}deepMerge(e,t){let s={...e};for(let n in t){let o=t[n],i=e[n];this.isPlainObject(o)&&this.isPlainObject(i)?s[n]=this.deepMerge(i,o):s[n]=o}return s}loadModeFile(e){let t=(0,q.join)(this.modesDir,`${e}.json`);if(!(0,F.existsSync)(t))throw new Error(`Mode file not found: ${t}`);let s=(0,F.readFileSync)(t,"utf-8");return JSON.parse(s)}loadMode(e){let t=this.parseInheritance(e);if(!t.hasParent)try{let d=this.loadModeFile(e);return this.activeMode=d,E.debug("SYSTEM",`Loaded mode: ${d.name} (${e})`,void 0,{types:d.observation_types.map(u=>u.id),concepts:d.observation_concepts.map(u=>u.id)}),d}catch(d){if(d instanceof Error?E.warn("WORKER",`Mode file not found: ${e}, falling back to 'code'`,{message:d.message}):E.warn("WORKER",`Mode file not found: ${e}, falling back to 'code'`,{error:String(d)}),e==="code")throw new Error("Critical: code.json mode file missing");return this.loadMode("code")}let{parentId:s,overrideId:n}=t,o;try{o=this.loadMode(s)}catch(d){d instanceof Error?E.warn("WORKER",`Parent mode '${s}' not found for ${e}, falling back to 'code'`,{message:d.message}):E.warn("WORKER",`Parent mode '${s}' not found for ${e}, falling back to 'code'`,{error:String(d)}),o=this.loadMode("code")}let i;try{i=this.loadModeFile(n),E.debug("SYSTEM",`Loaded override file: ${n} for parent ${s}`)}catch(d){return d instanceof Error?E.warn("WORKER",`Override file '${n}' not found, using parent mode '${s}' only`,{message:d.message}):E.warn("WORKER",`Override file '${n}' not found, using parent mode '${s}' only`,{error:String(d)}),this.activeMode=o,o}if(!i)return E.warn("SYSTEM",`Invalid override file: ${n}, using parent mode '${s}' only`),this.activeMode=o,o;let a=this.deepMerge(o,i);return this.activeMode=a,E.debug("SYSTEM",`Loaded mode with inheritance: ${a.name} (${e} = ${s} + ${n})`,void 0,{parent:s,override:n,types:a.observation_types.map(d=>d.id),concepts:a.observation_concepts.map(d=>d.id)}),a}getActiveMode(){if(!this.activeMode)throw new Error("No mode loaded. Call loadMode() first.");return this.activeMode}getObservationTypes(){return this.getActiveMode().observation_types}getObservationConcepts(){return this.getActiveMode().observation_concepts}getTypeIcon(e){return this.getObservationTypes().find(s=>s.id===e)?.emoji||"\u{1F4DD}"}getWorkEmoji(e){return this.getObservationTypes().find(s=>s.id===e)?.work_emoji||"\u{1F4DD}"}validateType(e){return this.getObservationTypes().some(t=>t.id===e)}getTypeLabel(e){return this.getObservationTypes().find(s=>s.id===e)?.label||e}};function ue(){let r=x.settings(),e=Y.loadFromFile(r),t=N.getInstance().getActiveMode(),s=new Set(t.observation_types.map(o=>o.id)),n=new Set(t.observation_concepts.map(o=>o.id));return{totalObservationCount:parseInt(e.CLAUDE_MEM_CONTEXT_OBSERVATIONS,10),fullObservationCount:parseInt(e.CLAUDE_MEM_CONTEXT_FULL_COUNT,10),sessionCount:parseInt(e.CLAUDE_MEM_CONTEXT_SESSION_COUNT,10),showReadTokens:e.CLAUDE_MEM_CONTEXT_SHOW_READ_TOKENS==="true",showWorkTokens:e.CLAUDE_MEM_CONTEXT_SHOW_WORK_TOKENS==="true",showSavingsAmount:e.CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_AMOUNT==="true",showSavingsPercent:e.CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_PERCENT==="true",observationTypes:s,observationConcepts:n,fullObservationField:e.CLAUDE_MEM_CONTEXT_FULL_FIELD,showLastSummary:e.CLAUDE_MEM_CONTEXT_SHOW_LAST_SUMMARY==="true",showLastMessage:e.CLAUDE_MEM_CONTEXT_SHOW_LAST_MESSAGE==="true"}}var _={reset:"\x1B[0m",bright:"\x1B[1m",dim:"\x1B[2m",cyan:"\x1B[36m",green:"\x1B[32m",yellow:"\x1B[33m",blue:"\x1B[34m",magenta:"\x1B[35m",gray:"\x1B[90m",red:"\x1B[31m"},je=4,Ee=1;function ce(r){let e=(r.title?.length||0)+(r.subtitle?.length||0)+(r.narrative?.length||0)+JSON.stringify(r.facts||[]).length;return Math.ceil(e/je)}function me(r){let e=r.length,t=r.reduce((i,a)=>i+ce(a),0),s=r.reduce((i,a)=>i+(a.discovery_tokens||0),0),n=s-t,o=s>0?Math.round(n/s*100):0;return{totalObservations:e,totalReadTokens:t,totalDiscoveryTokens:s,savings:n,savingsPercent:o}}function ns(r){return N.getInstance().getWorkEmoji(r)}function P(r,e){let t=ce(r),s=r.discovery_tokens||0,n=ns(r.type),o=s>0?`${n} ${s.toLocaleString()}`:"-";return{readTokens:t,discoveryTokens:s,discoveryDisplay:o,workEmoji:n}}function K(r){return r.showReadTokens||r.showWorkTokens||r.showSavingsAmount||r.showSavingsPercent}var Xe=U(require("path"),1),J=require("fs");var os=["private","claude-mem-context","system_instruction","system-instruction","persisted-output","system-reminder"],rr=new RegExp(`<(${os.join("|")})\\b[^>]*>[\\s\\S]*?</\\1>`,"g"),Ge=/<system-reminder>[\s\S]*?<\/system-reminder>/g;var is=["task-notification"],nr=new RegExp(`^\\s*<(${is.join("|")})\\b[^>]*>(?:(?!<\\1\\b|</\\1\\b)[\\s\\S])*</\\1>\\s*$`),or=256*1024;function le(r,e,t){let s=Array.from(t.observationTypes),n=s.map(()=>"?").join(","),o=Array.from(t.observationConcepts),i=o.map(()=>"?").join(",");return r.db.prepare(`
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
  `).all(e,e,...s,...o,t.totalObservationCount)}function pe(r,e,t){return r.db.prepare(`
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
  `).all(e,e,t.sessionCount+Ee)}function Be(r,e,t){let s=Array.from(t.observationTypes),n=s.map(()=>"?").join(","),o=Array.from(t.observationConcepts),i=o.map(()=>"?").join(","),a=e.map(()=>"?").join(",");return r.db.prepare(`
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
  `).all(...e,...e,...s,...o,t.totalObservationCount)}function We(r,e,t){let s=e.map(()=>"?").join(",");return r.db.prepare(`
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
  `).all(...e,...e,t.sessionCount+Ee)}function as(r){return r.replace(/\//g,"-")}function ds(r){if(!r.includes('"type":"assistant"'))return null;let e=JSON.parse(r);if(e.type==="assistant"&&e.message?.content&&Array.isArray(e.message.content)){let t="";for(let s of e.message.content)s.type==="text"&&(t+=s.text);if(t=t.replace(Ge,"").trim(),t)return t}return null}function _s(r){for(let e=r.length-1;e>=0;e--)try{let t=ds(r[e]);if(t)return t}catch(t){t instanceof Error?E.debug("WORKER","Skipping malformed transcript line",{lineIndex:e},t):E.debug("WORKER","Skipping malformed transcript line",{lineIndex:e,error:String(t)});continue}return""}function us(r){try{if(!(0,J.existsSync)(r))return{userMessage:"",assistantMessage:""};let e=(0,J.readFileSync)(r,"utf-8").trim();if(!e)return{userMessage:"",assistantMessage:""};let t=e.split(`
`).filter(n=>n.trim());return{userMessage:"",assistantMessage:_s(t)}}catch(e){return e instanceof Error?E.failure("WORKER","Failed to extract prior messages from transcript",{transcriptPath:r},e):E.warn("WORKER","Failed to extract prior messages from transcript",{transcriptPath:r,error:String(e)}),{userMessage:"",assistantMessage:""}}}function ge(r,e,t,s){if(!e.showLastMessage||r.length===0)return{userMessage:"",assistantMessage:""};let n=r.find(d=>d.memory_session_id!==t);if(!n)return{userMessage:"",assistantMessage:""};let o=n.memory_session_id,i=as(s),a=Xe.default.join(v,"projects",i,`${o}.jsonl`);return us(a)}function Ve(r,e){let t=e[0]?.id;return r.map((s,n)=>{let o=n===0?null:e[n+1];return{...s,displayEpoch:o?o.created_at_epoch:s.created_at_epoch,displayTime:o?o.created_at:s.created_at,shouldShowLink:s.id!==t}})}function Te(r,e){let t=[...r.map(s=>({type:"observation",data:s})),...e.map(s=>({type:"summary",data:s}))];return t.sort((s,n)=>{let o=s.type==="observation"?s.data.created_at_epoch:s.data.displayEpoch,i=n.type==="observation"?n.data.created_at_epoch:n.data.displayEpoch;return o-i}),t}function Ye(r,e){return new Set(r.slice(0,e).map(t=>t.id))}function qe(){let r=new Date,e=r.toLocaleDateString("en-CA"),t=r.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0}).toLowerCase().replace(" ",""),s=r.toLocaleTimeString("en-US",{timeZoneName:"short"}).split(" ").pop();return`${e} ${t} ${s}`}function Ke(r){return[`# [${r}] recent context, ${qe()}`,""]}function Je(){return[`Legend: \u{1F3AF}session ${N.getInstance().getActiveMode().observation_types.map(t=>`${t.emoji}${t.id}`).join(" ")}`,"Format: ID TIME TYPE TITLE","Fetch details: get_observations([IDs]) | Search: mem-search skill",""]}function Qe(){return[]}function ze(){return[]}function Ze(r,e){let t=[],s=[`${r.totalObservations} obs (${r.totalReadTokens.toLocaleString()}t read)`,`${r.totalDiscoveryTokens.toLocaleString()}t work`];return r.totalDiscoveryTokens>0&&(e.showSavingsAmount||e.showSavingsPercent)&&(e.showSavingsPercent?s.push(`${r.savingsPercent}% savings`):e.showSavingsAmount&&s.push(`${r.savings.toLocaleString()}t saved`)),t.push(`Stats: ${s.join(" | ")}`),t.push(""),t}function et(r){return[`### ${r}`]}function tt(r){return r.toLowerCase().replace(" am","a").replace(" pm","p")}function st(r,e,t){let s=r.title||"Untitled",n=N.getInstance().getTypeIcon(r.type),o=e?tt(e):'"';return`${r.id} ${o} ${n} ${s}`}function rt(r,e,t,s){let n=[],o=r.title||"Untitled",i=N.getInstance().getTypeIcon(r.type),a=e?tt(e):'"',{readTokens:d,discoveryDisplay:u}=P(r,s);n.push(`**${r.id}** ${a} ${i} **${o}**`),t&&n.push(t);let c=[];return s.showReadTokens&&c.push(`~${d}t`),s.showWorkTokens&&c.push(u),c.length>0&&n.push(c.join(" ")),n.push(""),n}function nt(r,e){return[`S${r.id} ${r.request||"Session started"} (${e})`]}function $(r,e){return e?[`**${r}**: ${e}`,""]:[]}function ot(r){return r.assistantMessage?["","---","","**Previously**","",`A: ${r.assistantMessage}`,""]:[]}function it(r,e){return["",`Access ${Math.round(r/1e3)}k tokens of past work via get_observations([IDs]) or mem-search skill.`]}function at(r){return`# [${r}] recent context, ${qe()}

No previous sessions found.`}function dt(){let r=new Date,e=r.toLocaleDateString("en-CA"),t=r.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0}).toLowerCase().replace(" ",""),s=r.toLocaleTimeString("en-US",{timeZoneName:"short"}).split(" ").pop();return`${e} ${t} ${s}`}function _t(r){return["",`${_.bright}${_.cyan}[${r}] recent context, ${dt()}${_.reset}`,`${_.gray}${"\u2500".repeat(60)}${_.reset}`,""]}function ut(){let e=N.getInstance().getActiveMode().observation_types.map(t=>`${t.emoji} ${t.id}`).join(" | ");return[`${_.dim}Legend: session-request | ${e}${_.reset}`,""]}function Et(){return[`${_.bright}Column Key${_.reset}`,`${_.dim}  Read: Tokens to read this observation (cost to learn it now)${_.reset}`,`${_.dim}  Work: Tokens spent on work that produced this record ( research, building, deciding)${_.reset}`,""]}function ct(){return[`${_.dim}Context Index: This semantic index (titles, types, files, tokens) is usually sufficient to understand past work.${_.reset}`,"",`${_.dim}When you need implementation details, rationale, or debugging context:${_.reset}`,`${_.dim}  - Fetch by ID: get_observations([IDs]) for observations visible in this index${_.reset}`,`${_.dim}  - Search history: Use the mem-search skill for past decisions, bugs, and deeper research${_.reset}`,`${_.dim}  - Trust this index over re-reading code for past decisions and learnings${_.reset}`,""]}function mt(r,e){let t=[];if(t.push(`${_.bright}${_.cyan}Context Economics${_.reset}`),t.push(`${_.dim}  Loading: ${r.totalObservations} observations (${r.totalReadTokens.toLocaleString()} tokens to read)${_.reset}`),t.push(`${_.dim}  Work investment: ${r.totalDiscoveryTokens.toLocaleString()} tokens spent on research, building, and decisions${_.reset}`),r.totalDiscoveryTokens>0&&(e.showSavingsAmount||e.showSavingsPercent)){let s="  Your savings: ";e.showSavingsAmount&&e.showSavingsPercent?s+=`${r.savings.toLocaleString()} tokens (${r.savingsPercent}% reduction from reuse)`:e.showSavingsAmount?s+=`${r.savings.toLocaleString()} tokens`:s+=`${r.savingsPercent}% reduction from reuse`,t.push(`${_.green}${s}${_.reset}`)}return t.push(""),t}function lt(r){return[`${_.bright}${_.cyan}${r}${_.reset}`,""]}function pt(r){return[`${_.dim}${r}${_.reset}`]}function gt(r,e,t,s){let n=r.title||"Untitled",o=N.getInstance().getTypeIcon(r.type),{readTokens:i,discoveryTokens:a,workEmoji:d}=P(r,s),u=t?`${_.dim}${e}${_.reset}`:" ".repeat(e.length),c=s.showReadTokens&&i>0?`${_.dim}(~${i}t)${_.reset}`:"",l=s.showWorkTokens&&a>0?`${_.dim}(${d} ${a.toLocaleString()}t)${_.reset}`:"";return`  ${_.dim}#${r.id}${_.reset}  ${u}  ${o}  ${n} ${c} ${l}`}function Tt(r,e,t,s,n){let o=[],i=r.title||"Untitled",a=N.getInstance().getTypeIcon(r.type),{readTokens:d,discoveryTokens:u,workEmoji:c}=P(r,n),l=t?`${_.dim}${e}${_.reset}`:" ".repeat(e.length),p=n.showReadTokens&&d>0?`${_.dim}(~${d}t)${_.reset}`:"",g=n.showWorkTokens&&u>0?`${_.dim}(${c} ${u.toLocaleString()}t)${_.reset}`:"";return o.push(`  ${_.dim}#${r.id}${_.reset}  ${l}  ${a}  ${_.bright}${i}${_.reset}`),s&&o.push(`    ${_.dim}${s}${_.reset}`),(p||g)&&o.push(`    ${p} ${g}`),o.push(""),o}function St(r,e){let t=`${r.request||"Session started"} (${e})`;return[`${_.yellow}#S${r.id}${_.reset} ${t}`,""]}function H(r,e,t){return e?[`${t}${r}:${_.reset} ${e}`,""]:[]}function ft(r){return r.assistantMessage?["","---","",`${_.bright}${_.magenta}Previously${_.reset}`,"",`${_.dim}A: ${r.assistantMessage}${_.reset}`,""]:[]}function bt(r,e){let t=Math.round(r/1e3);return["",`${_.dim}Access ${t}k tokens of past research & decisions for just ${e.toLocaleString()}t. Use the claude-mem skill to access memories by ID.${_.reset}`]}function Rt(r){return`
${_.bright}${_.cyan}[${r}] recent context, ${dt()}${_.reset}
${_.gray}${"\u2500".repeat(60)}${_.reset}

${_.dim}No previous sessions found for this project yet.${_.reset}
`}function ht(r,e,t,s){let n=[];return s?n.push(..._t(r)):n.push(...Ke(r)),s?n.push(...ut()):n.push(...Je()),s?n.push(...Et()):n.push(...Qe()),s?n.push(...ct()):n.push(...ze()),K(t)&&(s?n.push(...mt(e,t)):n.push(...Ze(e,t))),n}var Se=U(require("path"),1);function Z(r){if(!r)return[];try{let e=JSON.parse(r);return Array.isArray(e)?e:[]}catch(e){return E.debug("PARSER","Failed to parse JSON array, using empty fallback",{preview:r?.substring(0,50)},e instanceof Error?e:new Error(String(e))),[]}}function fe(r){return new Date(r).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit",hour12:!0})}function be(r){return new Date(r).toLocaleString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0})}function At(r){return new Date(r).toLocaleString("en-US",{month:"short",day:"numeric",year:"numeric"})}function Ot(r,e){return Se.default.isAbsolute(r)?Se.default.relative(e,r):r}function Ct(r,e,t){let s=Z(r);if(s.length>0)return Ot(s[0],e);if(t){let n=Z(t);if(n.length>0)return Ot(n[0],e)}return"General"}function Es(r){let e=new Map;for(let s of r){let n=s.type==="observation"?s.data.created_at:s.data.displayTime,o=At(n);e.has(o)||e.set(o,[]),e.get(o).push(s)}let t=Array.from(e.entries()).sort((s,n)=>{let o=new Date(s[0]).getTime(),i=new Date(n[0]).getTime();return o-i});return new Map(t)}function Nt(r,e){return e.fullObservationField==="narrative"?r.narrative:r.facts?Z(r.facts).join(`
`):null}function cs(r,e,t,s){let n=[];n.push(...et(r));let o="";for(let i of e)if(i.type==="summary"){let a=i.data,d=fe(a.displayTime);n.push(...nt(a,d))}else{let a=i.data,d=be(a.created_at),c=d!==o?d:"";if(o=d,t.has(a.id)){let p=Nt(a,s);n.push(...rt(a,c,p,s))}else n.push(st(a,c,s))}return n}function ms(r,e,t,s,n){let o=[];o.push(...lt(r));let i=null,a="";for(let d of e)if(d.type==="summary"){i=null,a="";let u=d.data,c=fe(u.displayTime);o.push(...St(u,c))}else{let u=d.data,c=Ct(u.files_modified,n,u.files_read),l=be(u.created_at),p=l!==a;a=l;let g=t.has(u.id);if(c!==i&&(o.push(...pt(c)),i=c),g){let S=Nt(u,s);o.push(...Tt(u,l,p,S,s))}else o.push(gt(u,l,p,s))}return o.push(""),o}function ls(r,e,t,s,n,o){return o?ms(r,e,t,s,n):cs(r,e,t,s)}function It(r,e,t,s,n){let o=[],i=Es(r);for(let[a,d]of i)o.push(...ls(a,d,e,t,s,n));return o}function Lt(r,e,t){return!(!r.showLastSummary||!e||!!!(e.investigated||e.learned||e.completed||e.next_steps)||t&&e.created_at_epoch<=t.created_at_epoch)}function Mt(r,e){let t=[];return e?(t.push(...H("Investigated",r.investigated,_.blue)),t.push(...H("Learned",r.learned,_.yellow)),t.push(...H("Completed",r.completed,_.green)),t.push(...H("Next Steps",r.next_steps,_.magenta))):(t.push(...$("Investigated",r.investigated)),t.push(...$("Learned",r.learned)),t.push(...$("Completed",r.completed)),t.push(...$("Next Steps",r.next_steps))),t}function Dt(r,e){return e?ft(r):ot(r)}function vt(r,e,t){return!K(e)||r.totalDiscoveryTokens<=0||r.savings<=0?[]:t?bt(r.totalDiscoveryTokens,r.totalReadTokens):it(r.totalDiscoveryTokens,r.totalReadTokens)}var ps=yt.default.join((0,Ut.homedir)(),".claude","plugins","marketplaces","thedotmack","plugin",".install-version");function gs(){try{return new W}catch(r){if(r instanceof Error&&r.code==="ERR_DLOPEN_FAILED"){try{(0,xt.unlinkSync)(ps)}catch(e){e instanceof Error?E.debug("WORKER","Marker file cleanup failed (may not exist)",{},e):E.debug("WORKER","Marker file cleanup failed (may not exist)",{error:String(e)})}return E.error("WORKER","Native module rebuild needed - restart Claude Code to auto-fix"),null}throw r}}function Ts(r,e){return e?Rt(r):at(r)}function Ss(r,e,t,s,n,o,i){let a=[],d=me(e);a.push(...ht(r,d,s,i));let u=t.slice(0,s.sessionCount),c=Ve(u,t),l=Te(e,c),p=Ye(e,s.fullObservationCount);a.push(...It(l,p,s,n,i));let g=t[0],S=e[0];Lt(s,g,S)&&a.push(...Mt(g,i));let R=ge(e,s,o,n);return a.push(...Dt(R,i)),a.push(...vt(d,s,i)),a.join(`
`).trimEnd()}async function Re(r,e=!1){let t=ue(),s=r?.cwd??process.cwd(),n=ie(s),o=r?.projects?.length?r.projects:n.allProjects,i=o[o.length-1]??n.primary;r?.full&&(t.totalObservationCount=999999,t.sessionCount=999999);let a=gs();if(!a)return"";try{let d=o.length>1?Be(a,o,t):le(a,i,t),u=o.length>1?We(a,o,t):pe(a,i,t);return d.length===0&&u.length===0?Ts(i,e):Ss(i,d,u,t,s,r?.session_id,e)}finally{a.close()}}0&&(module.exports={generateContext});
