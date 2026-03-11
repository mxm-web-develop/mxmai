import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Language = 'zh' | 'en';

interface Translations {
  [key: string]: {
    zh: string;
    en: string;
  };
}

// 翻译字典
const translations: Translations = {
  // 通用
  'app.title': {
    zh: 'SuperMX AI',
    en: 'SuperMX AI'
  },
  'app.subtitle': {
    zh: '控制面板',
    en: 'Control Panel'
  },
  'login': {
    zh: '登录',
    en: 'Login'
  },
  'logout': {
    zh: '登出',
    en: 'Logout'
  },
  'dashboard': {
    zh: '仪表盘',
    en: 'Dashboard'
  },
  'settings': {
    zh: '设置',
    en: 'Settings'
  },
  'theme': {
    zh: '主题',
    en: 'Theme'
  },
  'language': {
    zh: '语言',
    en: 'Language'
  },
  'dark': {
    zh: '暗色',
    en: 'Dark'
  },
  'light': {
    zh: '亮色',
    en: 'Light'
  },
  'chinese': {
    zh: '中文',
    en: 'Chinese'
  },
  'english': {
    zh: '英文',
    en: 'English'
  },
  
  // 侧边栏
  'sidebar.tasks': {
    zh: '生成任务',
    en: 'Generation Tasks'
  },
  'sidebar.dashboard': {
    zh: '仪表盘',
    en: 'Dashboard'
  },
  'sidebar.characters': {
    zh: '角色',
    en: 'Characters'
  },
  'sidebar.writing': {
    zh: '大纲与写作',
    en: 'Outline & Writing'
  },
  'sidebar.graph': {
    zh: '图片生成',
    en: 'Image Generation'
  },
  'sidebar.audio': {
    zh: '音频生成',
    en: 'Audio Generation'
  },
  'sidebar.video': {
    zh: '视频生成',
    en: 'Video Generation'
  },
  'sidebar.assets': {
    zh: '资产管理',
    en: 'Asset Management'
  },
  'sidebar.knowledge': {
    zh: '知识库',
    en: 'Knowledge Base'
  },
  'sidebar.virtualFolder': {
    zh: '虚拟文件夹',
    en: 'Virtual Folder'
  },
  'sidebar.account': {
    zh: '账号信息',
    en: 'Account Info'
  },
  'sidebar.admin': {
    zh: '管理员',
    en: 'Administrator'
  },
  'sidebar.users': {
    zh: '用户管理',
    en: 'User Management'
  },
  'sidebar.stats': {
    zh: '系统概览',
    en: 'System Overview'
  },
  'sidebar.taskMonitor': {
    zh: '任务监控',
    en: 'Task Monitoring'
  },
  
  // 页面副标题
  'page.subtitle.characters': {
    zh: '管理故事中的角色设定和属性',
    en: 'Manage character settings and attributes in stories'
  },
  'page.subtitle.writing': {
    zh: '创建故事大纲和进行文本写作',
    en: 'Create story outlines and perform text writing'
  },
  'page.subtitle.graph': {
    zh: '使用AI生成图片',
    en: 'Generate images using AI'
  },
  'page.subtitle.audio': {
    zh: '音频生成与处理',
    en: 'Audio generation and processing'
  },
  'page.subtitle.video': {
    zh: '视频生成与编辑',
    en: 'Video generation and editing'
  },
  'page.subtitle.knowledge': {
    zh: '管理知识库文档和资料',
    en: 'Manage knowledge base documents and materials'
  },
  'page.subtitle.virtualFolder': {
    zh: '管理虚拟文件夹和文件组织',
    en: 'Manage virtual folders and file organization'
  },
  'page.subtitle.account': {
    zh: '管理个人资料和账户设置',
    en: 'Manage personal profile and account settings'
  },
  'page.subtitle.users': {
    zh: '管理系统用户和权限',
    en: 'Manage system users and permissions'
  },
  'page.subtitle.stats': {
    zh: '系统使用情况和性能指标',
    en: 'System usage and performance metrics'
  },
  'page.subtitle.taskMonitor': {
    zh: '监控系统任务执行状态',
    en: 'Monitor system task execution status'
  },
  
  // 用户信息
  'user.notLoggedIn': {
    zh: '未登录',
    en: 'Not Logged In'
  },
  'user.admin': {
    zh: '管理员',
    en: 'Administrator'
  },
  'user.normal': {
    zh: '普通用户',
    en: 'Regular User'
  },
  
  // 仪表板
  'dashboard.title': {
    zh: '控制台仪表盘',
    en: 'Console Dashboard'
  },
  'dashboard.subtitle': {
    zh: '概览生成任务、资产与管理员功能的整体状态',
    en: 'Overview of generation tasks, assets, and administrator functions'
  },
  'dashboard.welcome': {
    zh: '欢迎回来',
    en: 'Welcome back'
  },
  'dashboard.currentRole': {
    zh: '当前身份',
    en: 'Current role'
  },
  'dashboard.description': {
    zh: '这里是 SuperMX AI 管理系统的概览页，后续可以接入任务、资产与系统统计数据。',
    en: 'This is the overview page of the SuperMX AI management system, where tasks, assets, and system statistics can be integrated later.'
  },
  'dashboard.tasksDesc': {
    zh: '统一管理角色、大纲、写作、图片、音频、视频等生成任务。',
    en: 'Unified management of generation tasks such as characters, outlines, writing, images, audio, and video.'
  },
  'dashboard.taskItem1': {
    zh: '查看最近任务状态与错误原因',
    en: 'View recent task status and error reasons'
  },
  'dashboard.taskItem2': {
    zh: '按类型筛选：写作 / 图像 / 音频 / 视频',
    en: 'Filter by type: Writing / Images / Audio / Video'
  },
  'dashboard.taskItem3': {
    zh: '后续可跳转到各任务详情与结果查看页面',
    en: 'Can navigate to task details and result viewing pages later'
  },
  'dashboard.assetsDesc': {
    zh: '管理知识库、虚拟文件夹与账号信息，为 AI 能力提供上下文与权限控制。',
    en: 'Manage knowledge base, virtual folders, and account information to provide context and permission control for AI capabilities.'
  },
  'dashboard.assetItem1': {
    zh: '维护知识库分组与索引配置',
    en: 'Maintain knowledge base grouping and index configuration'
  },
  'dashboard.assetItem2': {
    zh: '管理用户上传的素材与虚拟文件夹',
    en: 'Manage user-uploaded materials and virtual folders'
  },
  'dashboard.assetItem3': {
    zh: '查看余额、API Key 与账户安全设置',
    en: 'View balance, API Key, and account security settings'
  },
  'dashboard.adminDesc': {
    zh: '仅管理员可见，用于系统级监控与调度（如模型路由、敏感词、账单等）。',
    en: 'Visible only to administrators, used for system-level monitoring and scheduling (such as model routing, sensitive words, billing, etc.).'
  },
  'dashboard.adminItem1': {
    zh: '监控各 Provider 负载与错误率',
    en: 'Monitor load and error rates of each Provider'
  },
  'dashboard.adminItem2': {
    zh: '查看平台用量与计费情况',
    en: 'View platform usage and billing status'
  },
  'dashboard.adminItem3': {
    zh: '管理用户、任务与敏感词规则',
    en: 'Manage users, tasks, and sensitive word rules'
  },
  'user.guest': {
    zh: '用户',
    en: 'User'
  },
  
  // 登录页面
  'login.title': {
    zh: '登录 SuperMX AI',
    en: 'Login to SuperMX AI'
  },
  'login.username': {
    zh: '用户名',
    en: 'Username'
  },
  'login.password': {
    zh: '密码',
    en: 'Password'
  },
  'login.submit': {
    zh: '登录',
    en: 'Login'
  },
  'login.apiUrl': {
    zh: 'API Base URL（Gateway 地址）',
    en: 'API Base URL (Gateway Address)'
  },
  'login.apiPlaceholder': {
    zh: '留空则用当前域名（Vite 代理到 localhost:3000）',
    en: 'Leave empty to use current domain (Vite proxies to localhost:3000)'
  },
  'login.save': {
    zh: '保存',
    en: 'Save'
  },
  'login.error': {
    zh: '登录失败',
    en: 'Login failed'
  },
  'login.success': {
    zh: '登录成功',
    en: 'Login successful'
  },
  'login.expired': {
    zh: '登录已过期，请重新登录',
    en: 'Login expired, please login again'
  },
};

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  // 从localStorage读取保存的语言，默认为中文
  const [language, setLanguageState] = useState<Language>(() => {
    const savedLang = localStorage.getItem('language') as Language;
    return savedLang || 'zh';
  });

  // 设置语言
  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  // 翻译函数
  const t = (key: string): string => {
    if (translations[key]) {
      return translations[key][language] || translations[key].zh || key;
    }
    return key;
  };

  // 当语言变化时，更新localStorage
  useEffect(() => {
    localStorage.setItem('language', language);
    document.documentElement.setAttribute('lang', language);
  }, [language]);

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}