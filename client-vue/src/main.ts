// 应用入口：Pinia + Router + Element Plus（按需自动注册） + 全局样式
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import 'element-plus/dist/index.css'

import App from './App.vue'
import router from './router'
import './styles/global.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
// Element Plus：按需组件已经由 unplugin-vue-components 自动注册
// 这里再 use(ElementPlus) 是为了：
//   1. 加载 zh-cn 中文包
//   2. 注册 ElMessage / ElMessageBox / ElNotification 等命令式 API
//   3. 注册 ElLoading 等指令
app.use(ElementPlus, { locale: zhCn })

app.mount('#app')
