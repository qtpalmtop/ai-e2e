<template>
  <div class="login-page">
    <el-card class="login-card" shadow="hover">
      <template #header>
        <div class="header">
          <h1 class="title">E2E Orchestrator</h1>
          <span class="subtitle">Vue 3 + Element Plus 版</span>
        </div>
      </template>

      <el-tabs v-model="mode" class="tabs">
        <el-tab-pane label="登录" name="login" />
        <el-tab-pane label="注册" name="register" />
      </el-tabs>

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
        <el-form-item label="用户名" prop="username">
          <el-input
            v-model="form.username"
            placeholder="至少 3 个字符"
            autocomplete="username"
            autofocus
          />
        </el-form-item>

        <el-form-item label="密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="至少 6 个字符"
            show-password
            autocomplete="current-password"
            @keyup.enter="submit"
          />
        </el-form-item>

        <el-form-item v-if="mode === 'register'" label="昵称（可选）" prop="nickname">
          <el-input v-model="form.nickname" placeholder="留空则使用用户名" />
        </el-form-item>

        <el-alert
          v-if="errorMsg"
          :title="errorMsg"
          type="error"
          :closable="false"
          show-icon
          class="alert"
        />

        <el-button
          type="primary"
          native-type="submit"
          :loading="busy"
          class="submit"
          @click="submit"
        >
          {{ mode === 'login' ? '登录' : '注册' }}
        </el-button>

        <div class="tip">
          {{ mode === 'login' ? '注册会自动加入公共空间' : '已有账号？' }}
          <a v-if="mode === 'login'" @click="mode = 'register'">立即注册</a>
          <a v-else @click="mode = 'login'">返回登录</a>
        </div>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const mode = ref<'login' | 'register'>('login')
const formRef = ref<FormInstance>()
const busy = ref(false)
const errorMsg = ref<string | null>(null)

const form = reactive({
  username: '',
  password: '',
  nickname: '',
})

const rules: FormRules = {
  username: [{ required: true, min: 3, message: '至少 3 个字符', trigger: 'blur' }],
  password: [{ required: true, min: 6, message: '至少 6 个字符', trigger: 'blur' }],
}

async function submit() {
  errorMsg.value = null
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  busy.value = true
  try {
    if (mode.value === 'login') {
      await auth.login(form.username.trim(), form.password)
    } else {
      await auth.register(form.username.trim(), form.password, form.nickname.trim() || undefined)
    }
    ElMessage.success(mode.value === 'login' ? '登录成功' : '注册成功')
    const redirect = (route.query.redirect as string) || '/'
    router.replace(redirect)
  } catch (e: any) {
    errorMsg.value = e?.message ?? '操作失败'
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
  padding: 20px;
}

.login-card {
  width: 400px;
  border-radius: 12px;
}

.header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.title {
  margin: 0;
  font-size: 22px;
  color: #0f172a;
}

.subtitle {
  font-size: 12px;
  color: #64748b;
}

.tabs {
  margin-bottom: 16px;
}

.alert {
  margin-bottom: 16px;
}

.submit {
  width: 100%;
  height: 40px;
  font-size: 14px;
}

.tip {
  margin-top: 12px;
  font-size: 12px;
  color: #64748b;
  text-align: center;
}

.tip a {
  margin-left: 4px;
  cursor: pointer;
  color: #0ea5e9;
}

.tip a:hover {
  text-decoration: underline;
}
</style>
