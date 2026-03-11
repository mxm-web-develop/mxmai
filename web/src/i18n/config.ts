import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  zh: {
    translation: {
      nav: {
        groups: {
          tasks: '生成任务',
          assets: '资产管理',
          admin: '管理员操作',
        },
        items: {
          dashboard: '首页',
          characters: '角色',
          outline: '大纲',
          writing: '写作',
          graph: '图片',
          audio: '音频',
          video: '视频',
          knowledge: '知识库',
          virtualFolder: '虚拟文件夹',
          account: '我的账号信息',
          adminProviders: 'Provider 管理',
          users: '用户管理',
          adminStats: '系统概览',
          adminTasks: '任务监控',
          formOptions: '表单选项',
          promptConfig: '提示词工程',
          adminSensitiveWords: '敏感词管理',
          adminKnowledge: '系统知识库管理',
        },
      },
      page: {
        dashboard: '首页',
        landing: '首页',
      },
      header: {
        subtitle: 'Creative · Tech · AI Console',
      },
      auth: {
        loggedIn: '已登录',
        loggedOut: '未登录',
        logout: '退出',
      },
      landing: {
        kicker: 'SuperMX · AI Console',
        title: '一套控制台，驱动多模态 AI 生产',
        subtitle: '角色 · 大纲 · 写作 · 图片 · 音频 · 视频 · 知识库，统一在一个 Tech 风格控制台中编排与监控。',
        bullet1: '端到端多模态任务链路',
        bullet2: 'Provider 通道与用量可视化',
        bullet3: '适配自研与第三方模型路由',
        footnote: '登录后可访问完整控制台与 Admin 能力。',
        loginTitle: '登录控制台',
        loginSubtitle: '使用你的 SuperMX 账号接入网关。',
        baseUrlLabel: 'API Base URL（Gateway 地址）',
        baseUrlPlaceholder: '留空则使用当前域名（Vite 代理到 localhost:3000）',
        baseUrlSaved: 'Base URL 已保存',
        usernameLabel: '用户名',
        usernamePlaceholder: '输入用户名',
        passwordLabel: '密码',
        passwordPlaceholder: '输入密码',
        loginButton: '进入控制台',
        loggingIn: '登录中…',
        loginFailed: '登录失败: ',
        loginSuccess: '登录成功',
        save: '保存',
      },
    },
  },
  en: {
    translation: {
      nav: {
        groups: {
          tasks: 'Task Generation',
          assets: 'Assets',
          admin: 'Admin',
        },
        items: {
          dashboard: 'Home',
          characters: 'Characters',
          outline: 'Outline',
          writing: 'Writing',
          graph: 'Images',
          audio: 'Audio',
          video: 'Video',
          knowledge: 'Knowledge Base',
          virtualFolder: 'Virtual Folders',
          account: 'My Account',
          adminProviders: 'Provider Management',
          users: 'User Management',
          adminStats: 'System Overview',
          adminTasks: 'Task Monitor',
          formOptions: 'Form Options',
          promptConfig: 'Prompt Config',
          adminSensitiveWords: 'Sensitive Words',
          adminKnowledge: 'System Knowledge',
        },
      },
      page: {
        dashboard: 'Home',
        landing: 'Home',
      },
      header: {
        subtitle: 'Creative · Tech · AI Console',
      },
      auth: {
        loggedIn: 'Logged in',
        loggedOut: 'Not logged in',
        logout: 'Logout',
      },
      landing: {
        kicker: 'SuperMX · AI Console',
        title: 'One console for multimodal AI production',
        subtitle:
          'Characters, outlines, writing, images, audio, video and knowledge all orchestrated in a single tech console.',
        bullet1: 'End‑to‑end multimodal task chains',
        bullet2: 'Provider channels and usage visibility',
        bullet3: 'Works with in‑house and 3rd‑party model routing',
        footnote: 'Sign in to access the full console and admin capabilities.',
        loginTitle: 'Sign in',
        loginSubtitle: 'Use your SuperMX account to connect to the gateway.',
        baseUrlLabel: 'API Base URL (Gateway)',
        baseUrlPlaceholder: 'Leave empty to use current origin (Vite proxy to localhost:3000)',
        baseUrlSaved: 'Base URL saved',
        usernameLabel: 'Username',
        usernamePlaceholder: 'Enter your username',
        passwordLabel: 'Password',
        passwordPlaceholder: 'Enter your password',
        loginButton: 'Enter Console',
        loggingIn: 'Signing in…',
        loginFailed: 'Login failed: ',
        loginSuccess: 'Login succeeded',
        save: 'Save',
      },
    },
  },
};

const storedLang =
  typeof window !== 'undefined' ? (window.localStorage.getItem('mxm-lang') as 'zh' | 'en' | null) : null;

void i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: storedLang ?? 'zh',
    fallbackLng: 'zh',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;

