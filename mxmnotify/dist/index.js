"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/dotenv/package.json
var require_package = __commonJS({
  "node_modules/dotenv/package.json"(exports2, module2) {
    module2.exports = {
      name: "dotenv",
      version: "16.6.1",
      description: "Loads environment variables from .env file",
      main: "lib/main.js",
      types: "lib/main.d.ts",
      exports: {
        ".": {
          types: "./lib/main.d.ts",
          require: "./lib/main.js",
          default: "./lib/main.js"
        },
        "./config": "./config.js",
        "./config.js": "./config.js",
        "./lib/env-options": "./lib/env-options.js",
        "./lib/env-options.js": "./lib/env-options.js",
        "./lib/cli-options": "./lib/cli-options.js",
        "./lib/cli-options.js": "./lib/cli-options.js",
        "./package.json": "./package.json"
      },
      scripts: {
        "dts-check": "tsc --project tests/types/tsconfig.json",
        lint: "standard",
        pretest: "npm run lint && npm run dts-check",
        test: "tap run --allow-empty-coverage --disable-coverage --timeout=60000",
        "test:coverage": "tap run --show-full-coverage --timeout=60000 --coverage-report=text --coverage-report=lcov",
        prerelease: "npm test",
        release: "standard-version"
      },
      repository: {
        type: "git",
        url: "git://github.com/motdotla/dotenv.git"
      },
      homepage: "https://github.com/motdotla/dotenv#readme",
      funding: "https://dotenvx.com",
      keywords: [
        "dotenv",
        "env",
        ".env",
        "environment",
        "variables",
        "config",
        "settings"
      ],
      readmeFilename: "README.md",
      license: "BSD-2-Clause",
      devDependencies: {
        "@types/node": "^18.11.3",
        decache: "^4.6.2",
        sinon: "^14.0.1",
        standard: "^17.0.0",
        "standard-version": "^9.5.0",
        tap: "^19.2.0",
        typescript: "^4.8.4"
      },
      engines: {
        node: ">=12"
      },
      browser: {
        fs: false
      }
    };
  }
});

// node_modules/dotenv/lib/main.js
var require_main = __commonJS({
  "node_modules/dotenv/lib/main.js"(exports2, module2) {
    "use strict";
    var fs = require("fs");
    var path = require("path");
    var os = require("os");
    var crypto = require("crypto");
    var packageJson = require_package();
    var version = packageJson.version;
    var LINE = /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/mg;
    function parse(src) {
      const obj = {};
      let lines = src.toString();
      lines = lines.replace(/\r\n?/mg, "\n");
      let match;
      while ((match = LINE.exec(lines)) != null) {
        const key = match[1];
        let value = match[2] || "";
        value = value.trim();
        const maybeQuote = value[0];
        value = value.replace(/^(['"`])([\s\S]*)\1$/mg, "$2");
        if (maybeQuote === '"') {
          value = value.replace(/\\n/g, "\n");
          value = value.replace(/\\r/g, "\r");
        }
        obj[key] = value;
      }
      return obj;
    }
    function _parseVault(options) {
      options = options || {};
      const vaultPath = _vaultPath(options);
      options.path = vaultPath;
      const result = DotenvModule.configDotenv(options);
      if (!result.parsed) {
        const err = new Error(`MISSING_DATA: Cannot parse ${vaultPath} for an unknown reason`);
        err.code = "MISSING_DATA";
        throw err;
      }
      const keys = _dotenvKey(options).split(",");
      const length = keys.length;
      let decrypted;
      for (let i = 0; i < length; i++) {
        try {
          const key = keys[i].trim();
          const attrs = _instructions(result, key);
          decrypted = DotenvModule.decrypt(attrs.ciphertext, attrs.key);
          break;
        } catch (error) {
          if (i + 1 >= length) {
            throw error;
          }
        }
      }
      return DotenvModule.parse(decrypted);
    }
    function _warn(message) {
      console.log(`[dotenv@${version}][WARN] ${message}`);
    }
    function _debug(message) {
      console.log(`[dotenv@${version}][DEBUG] ${message}`);
    }
    function _log(message) {
      console.log(`[dotenv@${version}] ${message}`);
    }
    function _dotenvKey(options) {
      if (options && options.DOTENV_KEY && options.DOTENV_KEY.length > 0) {
        return options.DOTENV_KEY;
      }
      if (process.env.DOTENV_KEY && process.env.DOTENV_KEY.length > 0) {
        return process.env.DOTENV_KEY;
      }
      return "";
    }
    function _instructions(result, dotenvKey) {
      let uri;
      try {
        uri = new URL(dotenvKey);
      } catch (error) {
        if (error.code === "ERR_INVALID_URL") {
          const err = new Error("INVALID_DOTENV_KEY: Wrong format. Must be in valid uri format like dotenv://:key_1234@dotenvx.com/vault/.env.vault?environment=development");
          err.code = "INVALID_DOTENV_KEY";
          throw err;
        }
        throw error;
      }
      const key = uri.password;
      if (!key) {
        const err = new Error("INVALID_DOTENV_KEY: Missing key part");
        err.code = "INVALID_DOTENV_KEY";
        throw err;
      }
      const environment = uri.searchParams.get("environment");
      if (!environment) {
        const err = new Error("INVALID_DOTENV_KEY: Missing environment part");
        err.code = "INVALID_DOTENV_KEY";
        throw err;
      }
      const environmentKey = `DOTENV_VAULT_${environment.toUpperCase()}`;
      const ciphertext = result.parsed[environmentKey];
      if (!ciphertext) {
        const err = new Error(`NOT_FOUND_DOTENV_ENVIRONMENT: Cannot locate environment ${environmentKey} in your .env.vault file.`);
        err.code = "NOT_FOUND_DOTENV_ENVIRONMENT";
        throw err;
      }
      return { ciphertext, key };
    }
    function _vaultPath(options) {
      let possibleVaultPath = null;
      if (options && options.path && options.path.length > 0) {
        if (Array.isArray(options.path)) {
          for (const filepath of options.path) {
            if (fs.existsSync(filepath)) {
              possibleVaultPath = filepath.endsWith(".vault") ? filepath : `${filepath}.vault`;
            }
          }
        } else {
          possibleVaultPath = options.path.endsWith(".vault") ? options.path : `${options.path}.vault`;
        }
      } else {
        possibleVaultPath = path.resolve(process.cwd(), ".env.vault");
      }
      if (fs.existsSync(possibleVaultPath)) {
        return possibleVaultPath;
      }
      return null;
    }
    function _resolveHome(envPath) {
      return envPath[0] === "~" ? path.join(os.homedir(), envPath.slice(1)) : envPath;
    }
    function _configVault(options) {
      const debug = Boolean(options && options.debug);
      const quiet = options && "quiet" in options ? options.quiet : true;
      if (debug || !quiet) {
        _log("Loading env from encrypted .env.vault");
      }
      const parsed = DotenvModule._parseVault(options);
      let processEnv = process.env;
      if (options && options.processEnv != null) {
        processEnv = options.processEnv;
      }
      DotenvModule.populate(processEnv, parsed, options);
      return { parsed };
    }
    function configDotenv(options) {
      const dotenvPath = path.resolve(process.cwd(), ".env");
      let encoding = "utf8";
      const debug = Boolean(options && options.debug);
      const quiet = options && "quiet" in options ? options.quiet : true;
      if (options && options.encoding) {
        encoding = options.encoding;
      } else {
        if (debug) {
          _debug("No encoding is specified. UTF-8 is used by default");
        }
      }
      let optionPaths = [dotenvPath];
      if (options && options.path) {
        if (!Array.isArray(options.path)) {
          optionPaths = [_resolveHome(options.path)];
        } else {
          optionPaths = [];
          for (const filepath of options.path) {
            optionPaths.push(_resolveHome(filepath));
          }
        }
      }
      let lastError;
      const parsedAll = {};
      for (const path2 of optionPaths) {
        try {
          const parsed = DotenvModule.parse(fs.readFileSync(path2, { encoding }));
          DotenvModule.populate(parsedAll, parsed, options);
        } catch (e) {
          if (debug) {
            _debug(`Failed to load ${path2} ${e.message}`);
          }
          lastError = e;
        }
      }
      let processEnv = process.env;
      if (options && options.processEnv != null) {
        processEnv = options.processEnv;
      }
      DotenvModule.populate(processEnv, parsedAll, options);
      if (debug || !quiet) {
        const keysCount = Object.keys(parsedAll).length;
        const shortPaths = [];
        for (const filePath of optionPaths) {
          try {
            const relative = path.relative(process.cwd(), filePath);
            shortPaths.push(relative);
          } catch (e) {
            if (debug) {
              _debug(`Failed to load ${filePath} ${e.message}`);
            }
            lastError = e;
          }
        }
        _log(`injecting env (${keysCount}) from ${shortPaths.join(",")}`);
      }
      if (lastError) {
        return { parsed: parsedAll, error: lastError };
      } else {
        return { parsed: parsedAll };
      }
    }
    function config(options) {
      if (_dotenvKey(options).length === 0) {
        return DotenvModule.configDotenv(options);
      }
      const vaultPath = _vaultPath(options);
      if (!vaultPath) {
        _warn(`You set DOTENV_KEY but you are missing a .env.vault file at ${vaultPath}. Did you forget to build it?`);
        return DotenvModule.configDotenv(options);
      }
      return DotenvModule._configVault(options);
    }
    function decrypt(encrypted, keyStr) {
      const key = Buffer.from(keyStr.slice(-64), "hex");
      let ciphertext = Buffer.from(encrypted, "base64");
      const nonce = ciphertext.subarray(0, 12);
      const authTag = ciphertext.subarray(-16);
      ciphertext = ciphertext.subarray(12, -16);
      try {
        const aesgcm = crypto.createDecipheriv("aes-256-gcm", key, nonce);
        aesgcm.setAuthTag(authTag);
        return `${aesgcm.update(ciphertext)}${aesgcm.final()}`;
      } catch (error) {
        const isRange = error instanceof RangeError;
        const invalidKeyLength = error.message === "Invalid key length";
        const decryptionFailed = error.message === "Unsupported state or unable to authenticate data";
        if (isRange || invalidKeyLength) {
          const err = new Error("INVALID_DOTENV_KEY: It must be 64 characters long (or more)");
          err.code = "INVALID_DOTENV_KEY";
          throw err;
        } else if (decryptionFailed) {
          const err = new Error("DECRYPTION_FAILED: Please check your DOTENV_KEY");
          err.code = "DECRYPTION_FAILED";
          throw err;
        } else {
          throw error;
        }
      }
    }
    function populate(processEnv, parsed, options = {}) {
      const debug = Boolean(options && options.debug);
      const override = Boolean(options && options.override);
      if (typeof parsed !== "object") {
        const err = new Error("OBJECT_REQUIRED: Please check the processEnv argument being passed to populate");
        err.code = "OBJECT_REQUIRED";
        throw err;
      }
      for (const key of Object.keys(parsed)) {
        if (Object.prototype.hasOwnProperty.call(processEnv, key)) {
          if (override === true) {
            processEnv[key] = parsed[key];
          }
          if (debug) {
            if (override === true) {
              _debug(`"${key}" is already defined and WAS overwritten`);
            } else {
              _debug(`"${key}" is already defined and was NOT overwritten`);
            }
          }
        } else {
          processEnv[key] = parsed[key];
        }
      }
    }
    var DotenvModule = {
      configDotenv,
      _configVault,
      _parseVault,
      config,
      decrypt,
      parse,
      populate
    };
    module2.exports.configDotenv = DotenvModule.configDotenv;
    module2.exports._configVault = DotenvModule._configVault;
    module2.exports._parseVault = DotenvModule._parseVault;
    module2.exports.config = DotenvModule.config;
    module2.exports.decrypt = DotenvModule.decrypt;
    module2.exports.parse = DotenvModule.parse;
    module2.exports.populate = DotenvModule.populate;
    module2.exports = DotenvModule;
  }
});

// src/index.ts
var import_express8 = __toESM(require("express"));
var import_dotenv = __toESM(require_main());
var import_path = require("path");
var import_http = require("http");
var import_mxmdata5 = require("@mxmai/mxmdata");

// src/routes/health.ts
var import_express = require("express");
var router = (0, import_express.Router)();
router.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "mxmnotify" });
});
var health_default = router;

// src/routes/tasks.ts
var import_express2 = require("express");

// src/services/task.service.ts
var import_mxmdata = require("@mxmai/mxmdata");

// src/utils/logger.ts
var logger = {
  info: (message, ...args) => {
    console.log(`[mxmnotify] ${message}`, ...args);
  },
  error: (message, ...args) => {
    console.error(`[mxmnotify] ${message}`, ...args);
  },
  warn: (message, ...args) => {
    console.warn(`[mxmnotify] ${message}`, ...args);
  },
  debug: (message, ...args) => {
    if (process.env.DEBUG) {
      console.debug(`[mxmnotify] ${message}`, ...args);
    }
  }
};

// src/services/task.service.ts
var TaskService = class {
  supabase = (0, import_mxmdata.getSupabaseClient)();
  /**
   * 创建任务
   */
  async createTask(dto) {
    try {
      const { data, error } = await this.supabase.from("generation_tasks").insert({
        user_id: dto.user_id,
        task_type: dto.task_type,
        model_name: dto.model_name,
        status: "pending",
        prompt: dto.prompt,
        params: dto.params || {}
      }).select().single();
      if (error) {
        throw new Error(`Failed to create task: ${error.message}`);
      }
      logger.info(`Task created: ${data.id} for user ${dto.user_id}`);
      return data;
    } catch (error) {
      logger.error("Failed to create task:", error);
      throw error;
    }
  }
  /**
   * 更新任务状态
   */
  async updateTask(taskId, dto) {
    try {
      const updateData = {
        ...dto
      };
      if (dto.status === "completed" || dto.status === "failed") {
        updateData.completed_at = (/* @__PURE__ */ new Date()).toISOString();
      }
      if (dto.status === "processing") {
        const { data: existingTask } = await this.supabase.from("generation_tasks").select("started_at").eq("id", taskId).single();
        if (!existingTask?.started_at) {
          updateData.started_at = (/* @__PURE__ */ new Date()).toISOString();
        }
      }
      const { data, error } = await this.supabase.from("generation_tasks").update(updateData).eq("id", taskId).select().single();
      if (error) {
        throw new Error(`Failed to update task: ${error.message}`);
      }
      logger.info(`Task updated: ${taskId}, status: ${dto.status}`);
      return data;
    } catch (error) {
      logger.error("Failed to update task:", error);
      throw error;
    }
  }
  /**
   * 根据 ID 获取任务
   */
  async getTaskById(taskId) {
    try {
      const { data, error } = await this.supabase.from("generation_tasks").select("*").eq("id", taskId).single();
      if (error) {
        if (error.code === "PGRST116") {
          return null;
        }
        throw new Error(`Failed to get task: ${error.message}`);
      }
      return data;
    } catch (error) {
      logger.error("Failed to get task:", error);
      throw error;
    }
  }
  /**
   * 获取用户的任务列表
   */
  async getUserTasks(userId, options) {
    try {
      let query = this.supabase.from("generation_tasks").select("*", { count: "exact" }).eq("user_id", userId).order("created_at", { ascending: false });
      if (options?.status) {
        query = query.eq("status", options.status);
      }
      if (options?.task_type) {
        query = query.eq("task_type", options.task_type);
      }
      if (options?.limit) {
        query = query.limit(options.limit);
      }
      if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 20) - 1);
      }
      const { data, error, count } = await query;
      if (error) {
        throw new Error(`Failed to get user tasks: ${error.message}`);
      }
      return {
        tasks: data || [],
        total: count || 0
      };
    } catch (error) {
      logger.error("Failed to get user tasks:", error);
      throw error;
    }
  }
};

// src/routes/tasks.ts
var router2 = (0, import_express2.Router)();
var taskServiceInstance = null;
function getTaskService() {
  if (!taskServiceInstance) {
    taskServiceInstance = new TaskService();
  }
  return taskServiceInstance;
}
router2.post("/", async (req, res) => {
  try {
    const taskService = getTaskService();
    const { user_id, task_type, model_name, prompt, params } = req.body;
    if (!user_id || !task_type || !model_name || !prompt) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_PARAMETERS",
          message: "user_id, task_type, model_name, and prompt are required"
        }
      });
    }
    const task = await taskService.createTask({
      user_id,
      task_type,
      model_name,
      prompt,
      params
    });
    res.json({
      success: true,
      task
    });
  } catch (error) {
    logger.error("Failed to create task:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "CREATE_TASK_FAILED",
        message: error instanceof Error ? error.message : String(error)
      }
    });
  }
});
router2.put("/:taskId", async (req, res) => {
  try {
    const taskService = getTaskService();
    const { taskId } = req.params;
    const { status, result, error_message } = req.body;
    const task = await taskService.updateTask(taskId, {
      status,
      result,
      error_message
    });
    res.json({
      success: true,
      task
    });
  } catch (error) {
    logger.error("Failed to update task:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "UPDATE_TASK_FAILED",
        message: error instanceof Error ? error.message : String(error)
      }
    });
  }
});
router2.get("/:taskId", async (req, res) => {
  try {
    const taskService = getTaskService();
    const { taskId } = req.params;
    const task = await taskService.getTaskById(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: {
          code: "TASK_NOT_FOUND",
          message: "Task not found"
        }
      });
    }
    res.json({
      success: true,
      task
    });
  } catch (error) {
    logger.error("Failed to get task:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "GET_TASK_FAILED",
        message: error instanceof Error ? error.message : String(error)
      }
    });
  }
});
router2.get("/user/:userId", async (req, res) => {
  try {
    const taskService = getTaskService();
    const { userId } = req.params;
    const { status, task_type, limit, offset } = req.query;
    const result = await taskService.getUserTasks(userId, {
      status,
      task_type,
      limit: limit ? Number(limit) : void 0,
      offset: offset ? Number(offset) : void 0
    });
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error("Failed to get user tasks:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "GET_USER_TASKS_FAILED",
        message: error instanceof Error ? error.message : String(error)
      }
    });
  }
});
var tasks_default = router2;

// src/routes/notifications.ts
var import_express3 = require("express");

// src/services/notification.service.ts
var import_mxmdata2 = require("@mxmai/mxmdata");

// src/services/sse.service.ts
var SSEService = class {
  clients = /* @__PURE__ */ new Map();
  eventIdCounter = 0;
  /**
   * 添加 SSE 客户端连接
   */
  addClient(userId, res) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.write(`: connected

`);
    res.write(`event: connected
data: ${JSON.stringify({ message: "SSE connection established" })}

`);
    if (!this.clients.has(userId)) {
      this.clients.set(userId, []);
    }
    this.clients.get(userId).push({
      userId,
      response: res,
      lastEventId: this.eventIdCounter
    });
    logger.info(`SSE client connected: user ${userId}, total clients: ${this.clients.get(userId).length}`);
    res.on("close", () => {
      this.removeClient(userId, res);
      logger.info(`SSE client disconnected: user ${userId}`);
    });
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) {
        res.write(`: heartbeat

`);
      } else {
        clearInterval(heartbeat);
        this.removeClient(userId, res);
      }
    }, 3e4);
  }
  /**
   * 移除客户端连接
   */
  removeClient(userId, res) {
    const userClients = this.clients.get(userId);
    if (userClients) {
      const index = userClients.findIndex((client) => client.response === res);
      if (index !== -1) {
        userClients.splice(index, 1);
        if (userClients.length === 0) {
          this.clients.delete(userId);
        }
      }
    }
  }
  /**
   * 发送通知给用户的所有连接
   */
  sendNotification(userId, event, data) {
    const userClients = this.clients.get(userId);
    if (!userClients || userClients.length === 0) {
      logger.debug(`No SSE clients for user ${userId}`);
      return;
    }
    this.eventIdCounter++;
    const eventId = this.eventIdCounter;
    const message = `id: ${eventId}
event: ${event}
data: ${JSON.stringify(data)}

`;
    userClients.forEach((client, index) => {
      try {
        if (!client.response.writableEnded) {
          client.response.write(message);
          client.lastEventId = eventId;
        } else {
          userClients.splice(index, 1);
        }
      } catch (error) {
        logger.error(`Failed to send SSE message to client:`, error);
        userClients.splice(index, 1);
      }
    });
    if (userClients.length === 0) {
      this.clients.delete(userId);
    }
    logger.info(`Sent SSE notification to user ${userId}: ${event}`);
  }
  /**
   * 发送任务完成通知
   */
  sendTaskCompleted(userId, taskData) {
    this.sendNotification(userId, "task_completed", {
      type: "task_completed",
      task: taskData,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  /**
   * 发送任务失败通知
   */
  sendTaskFailed(userId, taskData) {
    this.sendNotification(userId, "task_failed", {
      type: "task_failed",
      task: taskData,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  /**
   * 发送通用通知
   */
  sendNotificationEvent(userId, notification) {
    this.sendNotification(userId, "notification", {
      type: "notification",
      notification,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  /**
   * 获取在线用户数
   */
  getOnlineUserCount() {
    return this.clients.size;
  }
  /**
   * 获取用户连接数
   */
  getUserConnectionCount(userId) {
    return this.clients.get(userId)?.length || 0;
  }
};
var sseService = new SSEService();

// src/services/notification.service.ts
var NotificationService = class {
  supabase = null;
  /**
   * 获取 Supabase 客户端（延迟初始化）
   */
  getSupabase() {
    if (!this.supabase) {
      try {
        this.supabase = (0, import_mxmdata2.getSupabaseClient)();
      } catch (error) {
        logger.error("[NotificationService] Supabase client not initialized:", {
          error: error instanceof Error ? error.message : String(error),
          hint: "Please ensure RepositoryFactory.init() is called at startup and Supabase config is correct"
        });
        throw new Error("Supabase client not initialized. Please check server logs for details.");
      }
    }
    return this.supabase;
  }
  /**
   * 创建通知
   */
  async createNotification(dto) {
    try {
      const { data, error } = await this.getSupabase().from("notifications").insert({
        user_id: dto.user_id,
        task_id: dto.task_id,
        type: dto.type,
        title: dto.title,
        content: dto.content,
        data: dto.data || {},
        is_read: false
      }).select().single();
      if (error) {
        throw new Error(`Failed to create notification: ${error.message}`);
      }
      logger.info(`Notification created: ${data.id} for user ${dto.user_id}`);
      return data;
    } catch (error) {
      logger.error("Failed to create notification:", error);
      throw error;
    }
  }
  /**
   * 发送任务完成通知
   */
  async sendTaskCompletedNotification(task) {
    const taskTypeLabel = task.task_type === "graph" ? "\u56FE\u7247\u751F\u6210" : "\u6587\u672C\u751F\u6210";
    const title = `${taskTypeLabel}\u4EFB\u52A1\u5DF2\u5B8C\u6210`;
    let content = `\u60A8\u7684${taskTypeLabel}\u4EFB\u52A1\u5DF2\u5B8C\u6210\u3002`;
    if (task.result?.image_urls?.length) {
      content += ` \u751F\u6210\u4E86 ${task.result.image_urls.length} \u5F20\u56FE\u7247\u3002`;
    } else if (task.result?.text) {
      content += ` \u751F\u6210\u4E86 ${task.result.text.length} \u4E2A\u5B57\u7B26\u7684\u6587\u672C\u3002`;
    }
    const notification = await this.createNotification({
      user_id: task.user_id,
      task_id: task.id,
      type: "task_completed",
      title,
      content,
      data: {
        task_id: task.id,
        task_type: task.task_type,
        model_name: task.model_name,
        result: task.result
      }
    });
    sseService.sendTaskCompleted(task.user_id, {
      notification,
      task
    });
    return notification;
  }
  /**
   * 发送任务失败通知
   */
  async sendTaskFailedNotification(task) {
    const taskTypeLabel = task.task_type === "graph" ? "\u56FE\u7247\u751F\u6210" : "\u6587\u672C\u751F\u6210";
    const title = `${taskTypeLabel}\u4EFB\u52A1\u5931\u8D25`;
    const notification = await this.createNotification({
      user_id: task.user_id,
      task_id: task.id,
      type: "task_failed",
      title,
      content: task.error_message || "\u4EFB\u52A1\u6267\u884C\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002",
      data: {
        task_id: task.id,
        task_type: task.task_type,
        model_name: task.model_name,
        error_message: task.error_message
      }
    });
    sseService.sendTaskFailed(task.user_id, {
      notification,
      task
    });
    return notification;
  }
  /**
   * 获取用户的通知列表
   */
  async getUserNotifications(userId, options) {
    try {
      let query = this.getSupabase().from("notifications").select("*", { count: "exact" }).eq("user_id", userId).order("created_at", { ascending: false });
      if (options?.is_read !== void 0) {
        query = query.eq("is_read", options.is_read);
      }
      if (options?.limit) {
        query = query.limit(options.limit);
      }
      if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 20) - 1);
      }
      const { data, error, count } = await query;
      if (error) {
        throw new Error(`Failed to get notifications: ${error.message}`);
      }
      return {
        notifications: data || [],
        total: count || 0
      };
    } catch (error) {
      logger.error("Failed to get notifications:", error);
      throw error;
    }
  }
  /**
   * 标记通知为已读
   */
  async markAsRead(notificationId) {
    try {
      const { error } = await this.getSupabase().from("notifications").update({
        is_read: true,
        read_at: (/* @__PURE__ */ new Date()).toISOString()
      }).eq("id", notificationId);
      if (error) {
        throw new Error(`Failed to mark notification as read: ${error.message}`);
      }
    } catch (error) {
      logger.error("Failed to mark notification as read:", error);
      throw error;
    }
  }
  /**
   * 标记所有通知为已读
   */
  async markAllAsRead(userId) {
    try {
      const { error } = await this.getSupabase().from("notifications").update({
        is_read: true,
        read_at: (/* @__PURE__ */ new Date()).toISOString()
      }).eq("user_id", userId).eq("is_read", false);
      if (error) {
        throw new Error(`Failed to mark all notifications as read: ${error.message}`);
      }
    } catch (error) {
      logger.error("Failed to mark all notifications as read:", error);
      throw error;
    }
  }
  /**
   * 删除通知
   */
  async deleteNotification(notificationId, userId) {
    try {
      const { data: notification, error: fetchError } = await this.getSupabase().from("notifications").select("user_id").eq("id", notificationId).single();
      if (fetchError) {
        throw new Error(`Notification not found: ${fetchError.message}`);
      }
      if (notification.user_id !== userId) {
        throw new Error("Unauthorized: Notification does not belong to user");
      }
      const { error } = await this.getSupabase().from("notifications").delete().eq("id", notificationId);
      if (error) {
        throw new Error(`Failed to delete notification: ${error.message}`);
      }
      logger.info(`Notification deleted: ${notificationId} by user ${userId}`);
    } catch (error) {
      logger.error("Failed to delete notification:", error);
      throw error;
    }
  }
  /**
   * 批量删除通知
   * @param notificationIds 通知ID数组
   * @param userId 用户ID
   * @returns 删除成功的通知ID数组
   */
  async deleteNotifications(notificationIds, userId) {
    try {
      if (!notificationIds || notificationIds.length === 0) {
        return [];
      }
      const { data: notifications, error: fetchError } = await this.getSupabase().from("notifications").select("id, user_id").in("id", notificationIds);
      if (fetchError) {
        throw new Error(`Failed to fetch notifications: ${fetchError.message}`);
      }
      const unauthorizedNotifications = notifications.filter((n) => n.user_id !== userId);
      if (unauthorizedNotifications.length > 0) {
        throw new Error(`Unauthorized: Some notifications do not belong to user`);
      }
      const validIds = notifications.map((n) => n.id);
      const invalidIds = notificationIds.filter((id) => !validIds.includes(id));
      if (invalidIds.length > 0) {
        logger.warn(`Some notification IDs not found: ${invalidIds.join(", ")}`);
      }
      const { error } = await this.getSupabase().from("notifications").delete().in("id", validIds);
      if (error) {
        throw new Error(`Failed to delete notifications: ${error.message}`);
      }
      logger.info(`Notifications deleted: ${validIds.length} by user ${userId}`);
      return validIds;
    } catch (error) {
      logger.error("Failed to delete notifications:", error);
      throw error;
    }
  }
};

// src/routes/notifications.ts
var import_mxmdata3 = require("@mxmai/mxmdata");
var router3 = (0, import_express3.Router)();
var notificationServiceInstance = null;
var taskServiceInstance2 = null;
function getNotificationService() {
  if (!notificationServiceInstance) {
    notificationServiceInstance = new NotificationService();
  }
  return notificationServiceInstance;
}
function getTaskService2() {
  if (!taskServiceInstance2) {
    taskServiceInstance2 = new TaskService();
  }
  return taskServiceInstance2;
}
function getUserIdFromRequest(req) {
  const userId = req.headers["x-user-id"];
  return userId || null;
}
router3.post("/task-completed", async (req, res) => {
  try {
    const notificationService = getNotificationService();
    const taskService = getTaskService2();
    const { task_id } = req.body;
    if (!task_id) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_PARAMETERS",
          message: "task_id is required"
        }
      });
    }
    const task = await taskService.getTaskById(task_id);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: {
          code: "TASK_NOT_FOUND",
          message: "Task not found"
        }
      });
    }
    const notification = await notificationService.sendTaskCompletedNotification(task);
    res.json({
      success: true,
      notification
    });
  } catch (error) {
    logger.error("Failed to send task completed notification:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "SEND_NOTIFICATION_FAILED",
        message: error instanceof Error ? error.message : String(error)
      }
    });
  }
});
router3.post("/task-failed", async (req, res) => {
  try {
    const notificationService = getNotificationService();
    const taskService = getTaskService2();
    const { task_id } = req.body;
    if (!task_id) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_PARAMETERS",
          message: "task_id is required"
        }
      });
    }
    const task = await taskService.getTaskById(task_id);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: {
          code: "TASK_NOT_FOUND",
          message: "Task not found"
        }
      });
    }
    const notification = await notificationService.sendTaskFailedNotification(task);
    res.json({
      success: true,
      notification
    });
  } catch (error) {
    logger.error("Failed to send task failed notification:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "SEND_NOTIFICATION_FAILED",
        message: error instanceof Error ? error.message : String(error)
      }
    });
  }
});
router3.get("/", async (req, res) => {
  try {
    const notificationService = getNotificationService();
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      const token = getTokenFromRequest(req);
      logger.warn("[Notifications] Failed to get userId from request:", {
        hasToken: !!token,
        hasAuthHeader: !!req.headers.authorization || !!req.headers.Authorization,
        authHeader: req.headers.authorization || req.headers.Authorization,
        headers: Object.keys(req.headers)
      });
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid or missing authentication token"
        }
      });
    }
    const { is_read, limit, offset } = req.query;
    const result = await notificationService.getUserNotifications(userId, {
      is_read: is_read === "true" ? true : is_read === "false" ? false : void 0,
      limit: limit ? Number(limit) : void 0,
      offset: offset ? Number(offset) : void 0
    });
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error("Failed to get notifications:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "GET_NOTIFICATIONS_FAILED",
        message: error instanceof Error ? error.message : String(error)
      }
    });
  }
});
router3.get("/user/:userId", async (req, res) => {
  try {
    const notificationService = getNotificationService();
    const { userId } = req.params;
    const { is_read, limit, offset } = req.query;
    const result = await notificationService.getUserNotifications(userId, {
      is_read: is_read === "true" ? true : is_read === "false" ? false : void 0,
      limit: limit ? Number(limit) : void 0,
      offset: offset ? Number(offset) : void 0
    });
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error("Failed to get notifications:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "GET_NOTIFICATIONS_FAILED",
        message: error instanceof Error ? error.message : String(error)
      }
    });
  }
});
router3.put("/:notificationId/read", async (req, res) => {
  try {
    const notificationService = getNotificationService();
    const { notificationId } = req.params;
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid or missing authentication token"
        }
      });
    }
    const supabase = (0, import_mxmdata3.getSupabaseClient)();
    const { data: notification, error: fetchError } = await supabase.from("notifications").select("user_id").eq("id", notificationId).single();
    if (fetchError || !notification) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOTIFICATION_NOT_FOUND",
          message: "Notification not found"
        }
      });
    }
    if (notification.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Notification does not belong to user"
        }
      });
    }
    await notificationService.markAsRead(notificationId);
    res.json({
      success: true
    });
  } catch (error) {
    logger.error("Failed to mark notification as read:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "MARK_READ_FAILED",
        message: error instanceof Error ? error.message : String(error)
      }
    });
  }
});
router3.put("/read-all", async (req, res) => {
  try {
    const notificationService = getNotificationService();
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid or missing authentication token"
        }
      });
    }
    await notificationService.markAllAsRead(userId);
    res.json({
      success: true
    });
  } catch (error) {
    logger.error("Failed to mark all notifications as read:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "MARK_ALL_READ_FAILED",
        message: error instanceof Error ? error.message : String(error)
      }
    });
  }
});
router3.put("/user/:userId/read-all", async (req, res) => {
  try {
    const notificationService = getNotificationService();
    const { userId } = req.params;
    await notificationService.markAllAsRead(userId);
    res.json({
      success: true
    });
  } catch (error) {
    logger.error("Failed to mark all notifications as read:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "MARK_ALL_READ_FAILED",
        message: error instanceof Error ? error.message : String(error)
      }
    });
  }
});
router3.delete("/:notificationId", async (req, res) => {
  try {
    const notificationService = getNotificationService();
    const { notificationId } = req.params;
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid or missing authentication token"
        }
      });
    }
    await notificationService.deleteNotification(notificationId, userId);
    res.json({
      success: true
    });
  } catch (error) {
    logger.error("Failed to delete notification:", error);
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: error.message
        }
      });
    }
    if (error instanceof Error && error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOTIFICATION_NOT_FOUND",
          message: error.message
        }
      });
    }
    res.status(500).json({
      success: false,
      error: {
        code: "DELETE_NOTIFICATION_FAILED",
        message: error instanceof Error ? error.message : String(error)
      }
    });
  }
});
router3.post("/delete-batch", async (req, res) => {
  try {
    const notificationService = getNotificationService();
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid or missing authentication token"
        }
      });
    }
    const { notification_ids } = req.body;
    if (!notification_ids || !Array.isArray(notification_ids) || notification_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_PARAMETERS",
          message: "notification_ids array is required and must not be empty"
        }
      });
    }
    const deletedIds = await notificationService.deleteNotifications(notification_ids, userId);
    res.json({
      success: true,
      data: {
        deleted_count: deletedIds.length,
        deleted_ids: deletedIds
      }
    });
  } catch (error) {
    logger.error("Failed to delete notifications:", error);
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: error.message
        }
      });
    }
    res.status(500).json({
      success: false,
      error: {
        code: "DELETE_NOTIFICATIONS_FAILED",
        message: error instanceof Error ? error.message : String(error)
      }
    });
  }
});
var notifications_default = router3;

// src/routes/sse.ts
var import_express4 = require("express");
var router4 = (0, import_express4.Router)();
router4.get("/:userId", (req, res) => {
  const { userId } = req.params;
  if (!userId) {
    return res.status(400).json({
      success: false,
      error: {
        code: "MISSING_USER_ID",
        message: "User ID is required"
      }
    });
  }
  sseService.addClient(userId, res);
  req.on("close", () => {
    sseService.removeClient(userId, res);
    logger.info(`SSE connection closed for user ${userId}`);
  });
});
var sse_default = router4;

// src/routes/websocket.ts
var import_express5 = require("express");
var import_ws2 = require("ws");
var import_jsonwebtoken = __toESM(require("jsonwebtoken"));

// src/services/websocket.service.ts
var import_ws = require("ws");

// src/types/notification.types.ts
var ModuleType = /* @__PURE__ */ ((ModuleType2) => {
  ModuleType2["MXMCGI"] = "mxmcgi";
  ModuleType2["MXMPAY"] = "mxmpay";
  ModuleType2["MXMAUTH"] = "mxmauth";
  ModuleType2["MXMAGENT"] = "mxmagent";
  return ModuleType2;
})(ModuleType || {});

// src/services/websocket.service.ts
var WebSocketService = class {
  clients = /* @__PURE__ */ new Map();
  userConnections = /* @__PURE__ */ new Map();
  pingInterval = null;
  constructor() {
    this.startHeartbeat();
  }
  /**
   * 添加客户端连接
   */
  addClient(userId, socket) {
    const client = {
      userId,
      socket,
      connectedAt: /* @__PURE__ */ new Date(),
      lastPingAt: /* @__PURE__ */ new Date(),
      subscribedEvents: /* @__PURE__ */ new Set()
      // 默认订阅所有事件
    };
    this.clients.set(socket, client);
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, /* @__PURE__ */ new Set());
    }
    this.userConnections.get(userId).add(socket);
    logger.info(
      `[WebSocket] Client connected: user ${userId}, total clients: ${this.clients.size}, user connections: ${this.userConnections.get(userId).size}`
    );
    this.sendMessage(socket, {
      type: "connected" /* CONNECTED */,
      data: {
        userId,
        message: "WebSocket connection established"
      },
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
    socket.on("close", () => {
      this.removeClient(socket);
    });
    socket.on("message", (data) => {
      this.handleClientMessage(socket, data);
    });
    socket.on("error", (error) => {
      logger.error(`[WebSocket] Socket error for user ${userId}:`, error);
    });
  }
  /**
   * 移除客户端连接
   */
  removeClient(socket) {
    const client = this.clients.get(socket);
    if (!client) {
      return;
    }
    const { userId } = client;
    this.clients.delete(socket);
    const userSockets = this.userConnections.get(userId);
    if (userSockets) {
      userSockets.delete(socket);
      if (userSockets.size === 0) {
        this.userConnections.delete(userId);
      }
    }
    logger.info(
      `[WebSocket] Client disconnected: user ${userId}, remaining clients: ${this.clients.size}`
    );
  }
  /**
   * 发送消息给用户的所有连接
   */
  sendToUser(userId, event, data) {
    const userSockets = this.userConnections.get(userId);
    if (!userSockets || userSockets.size === 0) {
      logger.debug(`[WebSocket] No connections for user ${userId}`);
      return;
    }
    const message = {
      type: "notification" /* NOTIFICATION */,
      event,
      data,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    const disconnectedSockets = [];
    userSockets.forEach((socket) => {
      const client = this.clients.get(socket);
      if (!client) {
        disconnectedSockets.push(socket);
        return;
      }
      if (client.subscribedEvents.size === 0 || client.subscribedEvents.has(event)) {
        try {
          if (socket.readyState === import_ws.WebSocket.OPEN) {
            socket.send(JSON.stringify(message));
          } else {
            disconnectedSockets.push(socket);
          }
        } catch (error) {
          logger.error(
            `[WebSocket] Failed to send message to user ${userId}:`,
            error
          );
          disconnectedSockets.push(socket);
        }
      }
    });
    disconnectedSockets.forEach((socket) => {
      this.removeClient(socket);
    });
    logger.info(
      `[WebSocket] Sent notification to user ${userId}: ${event} (${userSockets.size} connections)`
    );
  }
  /**
   * 发送任务完成通知
   */
  sendTaskCompleted(userId, taskData) {
    this.sendToUser(userId, "task_completed" /* TASK_COMPLETED */, {
      type: "task_completed" /* TASK_COMPLETED */,
      task: taskData
    });
  }
  /**
   * 发送任务失败通知
   */
  sendTaskFailed(userId, taskData) {
    this.sendToUser(userId, "task_failed" /* TASK_FAILED */, {
      type: "task_failed" /* TASK_FAILED */,
      task: taskData
    });
  }
  /**
   * 发送任务更新通知
   */
  sendTaskUpdated(userId, taskData) {
    this.sendToUser(userId, "task_updated" /* TASK_UPDATED */, {
      type: "task_updated" /* TASK_UPDATED */,
      task: taskData
    });
  }
  /**
   * 发送通用通知
   */
  sendNotificationEvent(userId, event, notification) {
    this.sendToUser(userId, event, {
      type: event,
      notification
    });
  }
  /**
   * 处理客户端消息
   */
  handleClientMessage(socket, data) {
    const client = this.clients.get(socket);
    if (!client) {
      return;
    }
    try {
      const message = JSON.parse(data.toString());
      switch (message.type) {
        case "ping" /* PING */:
          this.sendMessage(socket, {
            type: "pong" /* PONG */,
            data: { timestamp: (/* @__PURE__ */ new Date()).toISOString() },
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          });
          client.lastPingAt = /* @__PURE__ */ new Date();
          break;
        case "subscribe" /* SUBSCRIBE */:
          if (message.payload?.events && Array.isArray(message.payload.events)) {
            message.payload.events.forEach((event) => {
              client.subscribedEvents.add(event);
            });
            logger.debug(
              `[WebSocket] User ${client.userId} subscribed to events:`,
              Array.from(client.subscribedEvents)
            );
          }
          break;
        case "unsubscribe" /* UNSUBSCRIBE */:
          if (message.payload?.events && Array.isArray(message.payload.events)) {
            message.payload.events.forEach((event) => {
              client.subscribedEvents.delete(event);
            });
            logger.debug(
              `[WebSocket] User ${client.userId} unsubscribed from events:`,
              message.payload.events
            );
          }
          break;
        default:
          logger.warn(`[WebSocket] Unknown message type: ${message.type}`);
      }
    } catch (error) {
      logger.error(`[WebSocket] Failed to parse client message:`, error);
    }
  }
  /**
   * 发送消息给单个连接
   */
  sendMessage(socket, message) {
    try {
      if (socket.readyState === import_ws.WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    } catch (error) {
      logger.error(`[WebSocket] Failed to send message:`, error);
    }
  }
  /**
   * 启动心跳检测
   */
  startHeartbeat() {
    this.pingInterval = setInterval(() => {
      const now = /* @__PURE__ */ new Date();
      const timeout = 6e4;
      this.clients.forEach((client, socket) => {
        const timeSinceLastPing = now.getTime() - client.lastPingAt.getTime();
        if (timeSinceLastPing > timeout) {
          logger.warn(
            `[WebSocket] Client timeout: user ${client.userId}, closing connection`
          );
          socket.close();
          this.removeClient(socket);
        } else if (socket.readyState === import_ws.WebSocket.OPEN) {
          this.sendMessage(socket, {
            type: "pong" /* PONG */,
            data: { timestamp: now.toISOString() },
            timestamp: now.toISOString()
          });
        }
      });
    }, 3e4);
  }
  /**
   * 获取在线用户数
   */
  getOnlineUserCount() {
    return this.userConnections.size;
  }
  /**
   * 获取用户连接数
   */
  getUserConnectionCount(userId) {
    return this.userConnections.get(userId)?.size || 0;
  }
  /**
   * 获取总连接数
   */
  getTotalConnectionCount() {
    return this.clients.size;
  }
  /**
   * 广播消息给所有连接的客户端（全局通知）
   * @param event 事件类型
   * @param data 消息数据
   * @param excludeUserIds 排除的用户ID列表（可选）
   */
  broadcast(event, data, excludeUserIds) {
    const excludeSet = excludeUserIds ? new Set(excludeUserIds) : /* @__PURE__ */ new Set();
    const message = {
      type: "notification" /* NOTIFICATION */,
      event,
      data,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    let sentCount = 0;
    const disconnectedSockets = [];
    this.clients.forEach((client, socket) => {
      if (excludeSet.has(client.userId)) {
        return;
      }
      if (client.subscribedEvents.size === 0 || client.subscribedEvents.has(event)) {
        try {
          if (socket.readyState === import_ws.WebSocket.OPEN) {
            socket.send(JSON.stringify(message));
            sentCount++;
          } else {
            disconnectedSockets.push(socket);
          }
        } catch (error) {
          logger.error(
            `[WebSocket] Failed to broadcast message to user ${client.userId}:`,
            error
          );
          disconnectedSockets.push(socket);
        }
      }
    });
    disconnectedSockets.forEach((socket) => {
      this.removeClient(socket);
    });
    logger.info(
      `[WebSocket] Broadcast notification: ${event} to ${sentCount} connections (${this.clients.size} total)`
    );
  }
  /**
   * 发送消息给多个指定用户
   * @param userIds 用户ID列表
   * @param event 事件类型
   * @param data 消息数据
   */
  sendToUsers(userIds, event, data) {
    const userIdSet = new Set(userIds);
    let sentCount = 0;
    userIdSet.forEach((userId) => {
      const userSockets = this.userConnections.get(userId);
      if (!userSockets || userSockets.size === 0) {
        return;
      }
      const message = {
        type: "notification" /* NOTIFICATION */,
        event,
        data,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
      const disconnectedSockets = [];
      userSockets.forEach((socket) => {
        const client = this.clients.get(socket);
        if (!client) {
          disconnectedSockets.push(socket);
          return;
        }
        if (client.subscribedEvents.size === 0 || client.subscribedEvents.has(event)) {
          try {
            if (socket.readyState === import_ws.WebSocket.OPEN) {
              socket.send(JSON.stringify(message));
              sentCount++;
            } else {
              disconnectedSockets.push(socket);
            }
          } catch (error) {
            logger.error(
              `[WebSocket] Failed to send message to user ${userId}:`,
              error
            );
            disconnectedSockets.push(socket);
          }
        }
      });
      disconnectedSockets.forEach((socket) => {
        this.removeClient(socket);
      });
    });
    logger.info(
      `[WebSocket] Sent notification to ${userIds.length} users: ${event} (${sentCount} connections)`
    );
  }
  /**
   * 获取所有在线用户ID列表
   */
  getOnlineUserIds() {
    return Array.from(this.userConnections.keys());
  }
  /**
   * 清理资源
   */
  cleanup() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.clients.forEach((client, socket) => {
      socket.close();
    });
    this.clients.clear();
    this.userConnections.clear();
  }
};
var websocketService = new WebSocketService();

// src/routes/websocket.ts
var wss = null;
function getTokenFromRequest2(req) {
  if (req.url) {
    try {
      const url = new URL(req.url, "http://localhost");
      const token = url.searchParams.get("token");
      if (token) {
        return token;
      }
    } catch (error) {
      const match = req.url.match(/[?&]token=([^&]+)/);
      if (match && match[1]) {
        return decodeURIComponent(match[1]);
      }
    }
  }
  if (req.query && req.query.token) {
    return req.query.token;
  }
  const authHeader = req.headers?.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }
  return null;
}
function authenticateToken(token) {
  try {
    const secret = process.env.JWT_SECRET || "your-secret-key-change-in-production";
    const adminToken = process.env.ADMIN_TOKEN;
    if (adminToken && token === adminToken) {
      return "admin-test-user";
    }
    const decoded = import_jsonwebtoken.default.verify(token, secret);
    if (decoded.type !== "access") {
      logger.warn(`[WebSocket] Invalid token type: expected 'access', got '${decoded.type}'`);
      return null;
    }
    return decoded.userId;
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      logger.warn("[WebSocket] Token expired");
      return null;
    }
    if (error.name === "JsonWebTokenError") {
      logger.warn(`[WebSocket] Invalid JWT token: ${error.message}`);
      return null;
    }
    logger.error("[WebSocket] Failed to authenticate token:", error);
    return null;
  }
}
function setupWebSocketServer(server2) {
  if (wss) {
    logger.warn("[WebSocket] WebSocket server already initialized");
    return;
  }
  wss = new import_ws2.WebSocketServer({
    server: server2,
    path: "/ws/notifications"
  });
  wss.on("connection", (socket, req) => {
    logger.info("[WebSocket] New connection attempt");
    try {
      const token = getTokenFromRequest2(req);
      if (!token) {
        logger.warn("[WebSocket] No token provided, closing connection");
        socket.close(1008, "Unauthorized: No token provided");
        return;
      }
      const userId = authenticateToken(token);
      if (!userId) {
        logger.warn("[WebSocket] Token validation failed, closing connection");
        socket.close(1008, "Unauthorized: Invalid token");
        return;
      }
      websocketService.addClient(userId, socket);
      logger.info(`[WebSocket] Client authenticated and connected: user ${userId}`);
    } catch (error) {
      logger.error("[WebSocket] Connection error:", error);
      socket.close(1011, "Internal server error");
    }
  });
  wss.on("error", (error) => {
    logger.error("[WebSocket] Server error:", error);
  });
  logger.info("[WebSocket] WebSocket server initialized on path /ws/notifications");
}
var router5 = (0, import_express5.Router)();
router5.get("/health", (req, res) => {
  res.json({
    success: true,
    data: {
      online: wss !== null,
      connections: websocketService.getTotalConnectionCount(),
      users: websocketService.getOnlineUserCount()
    }
  });
});
var websocket_default = router5;

// src/routes/task-events.ts
var import_express6 = require("express");

// src/services/module-notification.service.ts
var import_mxmdata4 = require("@mxmai/mxmdata");

// src/handlers/base.handler.ts
var BaseNotificationHandler = class {
  supports(module_type) {
    return true;
  }
  async handle(event) {
    logger.debug(`[BaseHandler] Handling event for module ${event.module_type}, task ${event.task_id}`);
  }
  generateNotification(event) {
    if (event.notification_config) {
      const config = event.notification_config;
      return {
        notification_type: config.notification_type || "system" /* SYSTEM */,
        title: config.title || this.getDefaultTitle(event),
        content: config.content || this.getDefaultContent(event),
        action_url: config.action_url,
        avatar_url: config.avatar_url
      };
    }
    return {
      notification_type: "system" /* SYSTEM */,
      title: this.getDefaultTitle(event),
      content: this.getDefaultContent(event),
      action_url: this.getDefaultActionUrl(event)
    };
  }
  /**
   * 获取默认标题
   */
  getDefaultTitle(event) {
    const moduleName = this.getModuleName(event.module_type);
    switch (event.task_status) {
      case "completed" /* COMPLETED */:
        return `${moduleName}\u4EFB\u52A1\u5DF2\u5B8C\u6210`;
      case "failed" /* FAILED */:
        return `${moduleName}\u4EFB\u52A1\u5931\u8D25`;
      case "cancelled" /* CANCELLED */:
        return `${moduleName}\u4EFB\u52A1\u5DF2\u53D6\u6D88`;
      default:
        return `${moduleName}\u4EFB\u52A1\u72B6\u6001\u66F4\u65B0`;
    }
  }
  /**
   * 获取默认内容
   */
  getDefaultContent(event) {
    const moduleName = this.getModuleName(event.module_type);
    if (event.task_status_message) {
      return event.task_status_message;
    }
    switch (event.task_status) {
      case "completed" /* COMPLETED */:
        return `\u60A8\u7684${moduleName}\u4EFB\u52A1\u5DF2\u5B8C\u6210\uFF0C\u70B9\u51FB\u67E5\u770B\u8BE6\u60C5\u3002`;
      case "failed" /* FAILED */:
        return `\u60A8\u7684${moduleName}\u4EFB\u52A1\u6267\u884C\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002`;
      case "cancelled" /* CANCELLED */:
        return `\u60A8\u7684${moduleName}\u4EFB\u52A1\u5DF2\u53D6\u6D88\u3002`;
      default:
        return `\u60A8\u7684${moduleName}\u4EFB\u52A1\u72B6\u6001\u5DF2\u66F4\u65B0\u4E3A\uFF1A${event.task_status}\u3002`;
    }
  }
  /**
   * 获取默认跳转链接
   */
  getDefaultActionUrl(event) {
    const moduleType = event.module_type;
    const taskType = event.metadata?.task_type || event.metadata?.type;
    if (moduleType === "mxmcgi" /* MXMCGI */) {
      if (taskType === "writing") {
        return `/writing/${event.task_id}`;
      }
      return `/media/${taskType}/${event.task_id}`;
    }
    return `/tasks/${event.task_id}`;
  }
  /**
   * 获取模块名称
   */
  getModuleName(module_type) {
    const moduleNames = {
      ["mxmcgi" /* MXMCGI */]: "\u5185\u5BB9\u751F\u6210",
      ["mxmpay" /* MXMPAY */]: "\u652F\u4ED8",
      ["mxmauth" /* MXMAUTH */]: "\u8BA4\u8BC1",
      ["mxmagent" /* MXMAGENT */]: "\u667A\u80FD\u4F53"
    };
    return moduleNames[module_type] || "\u4EFB\u52A1";
  }
};

// src/handlers/cgi-task.handler.ts
var CgiTaskNotificationHandler = class extends BaseNotificationHandler {
  supports(module_type) {
    return module_type === "mxmcgi" /* MXMCGI */;
  }
  async handle(event) {
    logger.info(`[CgiTaskHandler] Handling CGI task event: ${event.task_id}, status: ${event.task_status}`);
  }
  generateNotification(event) {
    if (event.notification_config) {
      const config = event.notification_config;
      return {
        notification_type: config.notification_type || "reminder" /* REMINDER */,
        title: config.title || this.getCgiTaskTitle(event),
        content: config.content || this.getCgiTaskContent(event),
        action_url: config.action_url || this.getCgiTaskActionUrl(event),
        avatar_url: config.avatar_url
      };
    }
    return {
      notification_type: "reminder" /* REMINDER */,
      title: this.getCgiTaskTitle(event),
      content: this.getCgiTaskContent(event),
      action_url: this.getCgiTaskActionUrl(event)
    };
  }
  /**
   * 获取 CGI 任务标题
   */
  getCgiTaskTitle(event) {
    const taskType = event.metadata?.task_type || event.metadata?.type || "\u4EFB\u52A1";
    const taskTypeName = this.getTaskTypeName(taskType);
    switch (event.task_status) {
      case "completed" /* COMPLETED */:
        return `${taskTypeName}\u751F\u6210\u5B8C\u6210`;
      case "failed" /* FAILED */:
        return `${taskTypeName}\u751F\u6210\u5931\u8D25`;
      case "cancelled" /* CANCELLED */:
        return `${taskTypeName}\u751F\u6210\u5DF2\u53D6\u6D88`;
      case "processing" /* PROCESSING */:
        return `${taskTypeName}\u751F\u6210\u4E2D`;
      default:
        return `${taskTypeName}\u4EFB\u52A1\u72B6\u6001\u66F4\u65B0`;
    }
  }
  /**
   * 获取 CGI 任务内容
   */
  getCgiTaskContent(event) {
    const taskType = event.metadata?.task_type || event.metadata?.type || "\u4EFB\u52A1";
    const taskTypeName = this.getTaskTypeName(taskType);
    if (event.task_status_message) {
      return event.task_status_message;
    }
    switch (event.task_status) {
      case "completed" /* COMPLETED */:
        const mediaCount = event.metadata?.media_count || event.metadata?.result?.mediaUrls?.length;
        if (mediaCount) {
          return `\u60A8\u7684${taskTypeName}\u5DF2\u751F\u6210\u5B8C\u6210\uFF0C\u5171\u751F\u6210 ${mediaCount} \u4E2A\u6587\u4EF6\uFF0C\u70B9\u51FB\u67E5\u770B\u3002`;
        }
        return `\u60A8\u7684${taskTypeName}\u5DF2\u751F\u6210\u5B8C\u6210\uFF0C\u70B9\u51FB\u67E5\u770B\u3002`;
      case "failed" /* FAILED */:
        const errorMsg = event.metadata?.error || event.metadata?.error_message;
        if (errorMsg) {
          return `\u60A8\u7684${taskTypeName}\u751F\u6210\u5931\u8D25\uFF1A${errorMsg}\u3002\u8BF7\u91CD\u8BD5\u3002`;
        }
        return `\u60A8\u7684${taskTypeName}\u751F\u6210\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002`;
      case "cancelled" /* CANCELLED */:
        return `\u60A8\u7684${taskTypeName}\u751F\u6210\u5DF2\u53D6\u6D88\u3002`;
      case "processing" /* PROCESSING */:
        const progress = event.metadata?.progress;
        if (progress !== void 0) {
          return `\u60A8\u7684${taskTypeName}\u6B63\u5728\u751F\u6210\u4E2D\uFF0C\u8FDB\u5EA6\uFF1A${progress}%`;
        }
        return `\u60A8\u7684${taskTypeName}\u6B63\u5728\u751F\u6210\u4E2D\uFF0C\u8BF7\u7A0D\u5019...`;
      default:
        return `\u60A8\u7684${taskTypeName}\u72B6\u6001\u5DF2\u66F4\u65B0\u4E3A\uFF1A${event.task_status}\u3002`;
    }
  }
  /**
   * 获取 CGI 任务跳转链接
   */
  getCgiTaskActionUrl(event) {
    const taskType = event.metadata?.task_type || event.metadata?.type;
    switch (taskType) {
      case "writing":
        return `/writing/${event.task_id}`;
      case "image":
      case "graph":
        return `/media/graph/${event.task_id}`;
      case "video":
        return `/media/video/${event.task_id}`;
      case "audio":
        return `/media/audio/${event.task_id}`;
      case "text":
        return `/media/text/${event.task_id}`;
      default:
        return `/media/${taskType}/${event.task_id}`;
    }
  }
  /**
   * 获取任务类型名称
   */
  getTaskTypeName(taskType) {
    const typeNames = {
      writing: "\u5199\u4F5C",
      image: "\u56FE\u7247",
      graph: "\u56FE\u7247",
      video: "\u89C6\u9891",
      audio: "\u97F3\u9891",
      text: "\u6587\u672C"
    };
    return typeNames[taskType] || "\u5185\u5BB9";
  }
};

// src/services/module-notification.service.ts
var ModuleNotificationService = class {
  supabase = null;
  handlers = /* @__PURE__ */ new Map();
  defaultHandler;
  constructor() {
    this.defaultHandler = new BaseNotificationHandler();
    this.registerHandler(new CgiTaskNotificationHandler());
  }
  /**
   * 获取 Supabase 客户端（延迟初始化）
   */
  getSupabase() {
    if (!this.supabase) {
      this.supabase = (0, import_mxmdata4.getSupabaseClient)();
    }
    return this.supabase;
  }
  /**
   * 注册通知处理器
   */
  registerHandler(handler) {
    Object.values(ModuleType).forEach((moduleType) => {
      if (handler.supports(moduleType)) {
        this.handlers.set(moduleType, handler);
        logger.info(`[ModuleNotification] Registered handler for module: ${moduleType}`);
      }
    });
  }
  /**
   * 处理异步任务状态变更事件
   */
  async handleTaskStatusChanged(event) {
    try {
      logger.info(
        `[ModuleNotification] Handling task status changed: module=${event.module_type}, task=${event.task_id}, status=${event.task_status}`
      );
      const handler = this.handlers.get(event.module_type) || this.defaultHandler;
      const notificationContent = handler.generateNotification(event);
      const notification = await this.createNotification({
        user_id: event.user_id,
        module_type: event.module_type,
        task_id: event.task_id,
        task_status: event.task_status,
        task_status_message: event.task_status_message,
        notification_type: notificationContent.notification_type,
        title: notificationContent.title,
        content: notificationContent.content,
        action_url: notificationContent.action_url,
        avatar_url: notificationContent.avatar_url,
        metadata: event.metadata || {}
      });
      await handler.handle(event);
      this.sendWebSocketNotification(event, notification);
      this.sendSSENotification(event, notification);
      logger.info(
        `[ModuleNotification] Notification created and sent: ${notification.id} for user ${event.user_id}`
      );
    } catch (error) {
      logger.error("[ModuleNotification] Failed to handle task status changed:", error);
      throw error;
    }
  }
  /**
   * 发送全局通知（广播给所有在线用户）
   * @param event 事件类型
   * @param data 通知数据
   * @param excludeUserIds 排除的用户ID列表（可选）
   */
  async sendGlobalNotification(event, data, excludeUserIds) {
    try {
      const onlineUserIds = websocketService.getOnlineUserIds();
      const targetUserIds = excludeUserIds ? onlineUserIds.filter((id) => !excludeUserIds.includes(id)) : onlineUserIds;
      if (targetUserIds.length === 0) {
        logger.debug("[ModuleNotification] No online users to send global notification");
        return;
      }
      websocketService.broadcast(event, {
        type: "global_notification",
        notification: data
      }, excludeUserIds);
      logger.info(
        `[ModuleNotification] Global notification sent: ${event} to ${targetUserIds.length} users`
      );
    } catch (error) {
      logger.error("[ModuleNotification] Failed to send global notification:", error);
      throw error;
    }
  }
  /**
   * 发送通知给多个指定用户
   * @param userIds 用户ID列表
   * @param event 事件类型
   * @param data 通知数据
   */
  async sendNotificationToUsers(userIds, event, data) {
    try {
      if (userIds.length === 0) {
        logger.debug("[ModuleNotification] No users specified for notification");
        return;
      }
      websocketService.sendToUsers(userIds, event, {
        type: "multi_user_notification",
        notification: data
      });
      logger.info(
        `[ModuleNotification] Notification sent to ${userIds.length} users: ${event}`
      );
    } catch (error) {
      logger.error("[ModuleNotification] Failed to send notification to users:", error);
      throw error;
    }
  }
  /**
   * 创建通知记录
   */
  async createNotification(data) {
    try {
      let taskId = null;
      if (data.module_type === "mxmcgi") {
        taskId = null;
      } else {
        const { data: task } = await this.getSupabase().from("generation_tasks").select("id").eq("id", data.task_id).single();
        if (task) {
          taskId = data.task_id;
        }
      }
      const insertData = {
        user_id: data.user_id,
        type: data.notification_type,
        title: data.title,
        content: data.content,
        data: {
          module_type: data.module_type,
          task_id: data.task_id,
          // 在 data 字段中保存原始 task_id，即使不在 generation_tasks 中
          task_status: data.task_status,
          task_status_message: data.task_status_message,
          action_url: data.action_url,
          avatar_url: data.avatar_url,
          ...data.metadata
        },
        is_read: false
      };
      if (taskId) {
        insertData.task_id = taskId;
      }
      const { data: notification, error } = await this.getSupabase().from("notifications").insert(insertData).select().single();
      if (error) {
        throw new Error(`Failed to create notification: ${error.message}`);
      }
      return notification;
    } catch (error) {
      logger.error("[ModuleNotification] Failed to create notification:", error);
      throw error;
    }
  }
  /**
   * 通过 WebSocket 推送通知
   */
  sendWebSocketNotification(event, notification) {
    let eventType;
    switch (event.task_status) {
      case "completed" /* COMPLETED */:
        eventType = "task_completed" /* TASK_COMPLETED */;
        break;
      case "failed" /* FAILED */:
        eventType = "task_failed" /* TASK_FAILED */;
        break;
      default:
        eventType = "task_updated" /* TASK_UPDATED */;
    }
    websocketService.sendToUser(event.user_id, eventType, {
      notification,
      task: {
        id: event.task_id,
        status: event.task_status,
        module_type: event.module_type,
        ...event.metadata
      }
    });
  }
  /**
   * 通过 SSE 推送通知（向后兼容）
   */
  sendSSENotification(event, notification) {
    if (event.task_status === "completed" /* COMPLETED */) {
      sseService.sendTaskCompleted(event.user_id, {
        notification,
        task: {
          id: event.task_id,
          status: event.task_status,
          ...event.metadata
        }
      });
    } else if (event.task_status === "failed" /* FAILED */) {
      sseService.sendTaskFailed(event.user_id, {
        notification,
        task: {
          id: event.task_id,
          status: event.task_status,
          ...event.metadata
        }
      });
    }
  }
};
var moduleNotificationService = new ModuleNotificationService();

// src/routes/task-events.ts
var router6 = (0, import_express6.Router)();
router6.post("/status-changed", async (req, res) => {
  try {
    const event = {
      event_type: "async_task.status_changed",
      module_type: req.body.module_type,
      task_id: req.body.task_id,
      user_id: req.body.user_id,
      task_status: req.body.task_status,
      task_status_message: req.body.task_status_message,
      metadata: req.body.metadata || {},
      notification_config: req.body.notification_config
    };
    if (!event.module_type || !event.task_id || !event.user_id || !event.task_status) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_PARAMETERS",
          message: "module_type, task_id, user_id, and task_status are required"
        }
      });
    }
    await moduleNotificationService.handleTaskStatusChanged(event);
    res.json({
      success: true,
      message: "Event processed successfully"
    });
  } catch (error) {
    logger.error("[TaskEvents] Failed to process status changed event:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "PROCESS_EVENT_FAILED",
        message: error instanceof Error ? error.message : String(error)
      }
    });
  }
});
var task_events_default = router6;

// src/routes/notifications-broadcast.ts
var import_express7 = require("express");
var router7 = (0, import_express7.Router)();
router7.post("/broadcast", async (req, res) => {
  try {
    const { event, title, content, action_url, avatar_url, metadata, exclude_user_ids } = req.body;
    if (!event || !title || !content) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_PARAMETERS",
          message: "event, title, and content are required"
        }
      });
    }
    await moduleNotificationService.sendGlobalNotification(
      event,
      {
        title,
        content,
        action_url,
        avatar_url,
        metadata: metadata || {}
      },
      exclude_user_ids
    );
    res.json({
      success: true,
      message: "Global notification sent successfully"
    });
  } catch (error) {
    logger.error("[NotificationsBroadcast] Failed to send global notification:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "SEND_NOTIFICATION_FAILED",
        message: error instanceof Error ? error.message : String(error)
      }
    });
  }
});
router7.post("/users", async (req, res) => {
  try {
    const { user_ids, event, title, content, action_url, avatar_url, metadata } = req.body;
    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_PARAMETERS",
          message: "user_ids (array) is required"
        }
      });
    }
    if (!event || !title || !content) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_PARAMETERS",
          message: "event, title, and content are required"
        }
      });
    }
    await moduleNotificationService.sendNotificationToUsers(
      user_ids,
      event,
      {
        title,
        content,
        action_url,
        avatar_url,
        metadata: metadata || {}
      }
    );
    res.json({
      success: true,
      message: `Notification sent to ${user_ids.length} users`
    });
  } catch (error) {
    logger.error("[NotificationsBroadcast] Failed to send notification to users:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "SEND_NOTIFICATION_FAILED",
        message: error instanceof Error ? error.message : String(error)
      }
    });
  }
});
var notifications_broadcast_default = router7;

// src/index.ts
process.env.DOTENV_CONFIG_DEBUG = "false";
import_dotenv.default.config({ path: (0, import_path.resolve)(__dirname, "../../.env") });
import_dotenv.default.config();
try {
  logger.info("\u{1F50D} \u73AF\u5883\u53D8\u91CF\u68C0\u67E5:", {
    SUPABASE_URL: process.env.SUPABASE_URL ? "\u5DF2\u8BBE\u7F6E" : "\u672A\u8BBE\u7F6E",
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ? "\u5DF2\u8BBE\u7F6E" : "\u672A\u8BBE\u7F6E",
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ? "\u5DF2\u8BBE\u7F6E" : "\u672A\u8BBE\u7F6E"
  });
  import_mxmdata5.RepositoryFactory.init();
  logger.info("\u2705 mxmdata \u521D\u59CB\u5316\u6210\u529F");
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    logger.error("\u274C SUPABASE_URL \u548C SUPABASE_ANON_KEY \u73AF\u5883\u53D8\u91CF\u662F\u5FC5\u9700\u7684");
    process.exit(1);
  }
  try {
    (0, import_mxmdata5.initSupabaseClient)({
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
      serviceKey: supabaseServiceKey
    });
    logger.info("\u2705 Supabase \u5BA2\u6237\u7AEF\u663E\u5F0F\u521D\u59CB\u5316\u6210\u529F");
  } catch (supabaseInitError) {
    logger.error("\u274C Supabase \u5BA2\u6237\u7AEF\u521D\u59CB\u5316\u5931\u8D25:", supabaseInitError instanceof Error ? supabaseInitError.message : supabaseInitError);
    process.exit(1);
  }
  try {
    const client = (0, import_mxmdata5.getSupabaseClient)();
    logger.info("\u2705 Supabase \u5BA2\u6237\u7AEF\u9A8C\u8BC1\u6210\u529F");
  } catch (supabaseError) {
    logger.error("\u274C Supabase \u5BA2\u6237\u7AEF\u9A8C\u8BC1\u5931\u8D25:", supabaseError instanceof Error ? supabaseError.message : supabaseError);
    process.exit(1);
  }
} catch (error) {
  logger.error("\u274C mxmdata \u521D\u59CB\u5316\u5931\u8D25:", error instanceof Error ? error.message : error);
  logger.error("\u274C \u9519\u8BEF\u5806\u6808:", error instanceof Error ? error.stack : String(error));
  process.exit(1);
}
var app = (0, import_express8.default)();
var server = (0, import_http.createServer)(app);
var port = process.env.PORT ? Number(process.env.PORT) : 4005;
app.use(import_express8.default.json());
app.use("/", health_default);
app.use("/tasks", tasks_default);
app.use("/notifications", notifications_default);
app.use("/sse", sse_default);
app.use("/ws", websocket_default);
app.use("/task-events", task_events_default);
app.use("/notifications/broadcast", notifications_broadcast_default);
setupWebSocketServer(server);
server.listen(port, () => {
  logger.info(`mxmnotify service listening on port ${port}`);
  logger.info("Routes:");
  logger.info("  - GET  /health");
  logger.info("  - POST /tasks");
  logger.info("  - PUT  /tasks/:taskId");
  logger.info("  - GET  /tasks/:taskId");
  logger.info("  - GET  /tasks/user/:userId");
  logger.info("  - POST /notifications/task-completed");
  logger.info("  - POST /notifications/task-failed");
  logger.info("  - GET  /notifications (\u5F53\u524D\u7528\u6237\u901A\u77E5\u5217\u8868)");
  logger.info("  - GET  /notifications/user/:userId (\u517C\u5BB9\u65E7\u63A5\u53E3)");
  logger.info("  - PUT  /notifications/:notificationId/read (\u6807\u8BB0\u5DF2\u8BFB)");
  logger.info("  - PUT  /notifications/read-all (\u6807\u8BB0\u6240\u6709\u5DF2\u8BFB)");
  logger.info("  - PUT  /notifications/user/:userId/read-all (\u517C\u5BB9\u65E7\u63A5\u53E3)");
  logger.info("  - DELETE /notifications/:notificationId (\u5220\u9664\u901A\u77E5)");
  logger.info("  - POST  /notifications/delete-batch (\u6279\u91CF\u5220\u9664\u901A\u77E5)");
  logger.info("  - GET  /sse/:userId (SSE connection)");
  logger.info("  - WS   /ws/notifications (WebSocket connection)");
  logger.info("  - GET  /ws/health (WebSocket health check)");
  logger.info("  - POST /task-events/status-changed (Task status changed event)");
  logger.info("  - POST /notifications/broadcast (Global notification broadcast)");
  logger.info("  - POST /notifications/broadcast/users (Multi-user notification)");
});
process.on("SIGTERM", () => {
  logger.info("[Server] SIGTERM received, closing server...");
  server.close(() => {
    logger.info("[Server] Server closed");
    process.exit(0);
  });
});
//# sourceMappingURL=index.js.map