<!--
  表单实时预览（画布下方）
  - 渲染当前 draft 的所有原子
  - 受 AtomInput 控制：用户输入会写回本地 data
  - 联动规则：visible / required / disabled 由 formRules 求值
  - 注意：本组件命名为 FormLivePreview，避开与 /components/LivePreview.vue 的命名冲突
    （unplugin-vue-components 会扫到两个 LivePreview.vue 导致告警）
-->
<template>
  <div class="preview">
    <div class="title">实时预览</div>
    <div class="box">
      <div v-if="schema.atoms.length === 0" class="empty">画布为空</div>
      <template v-else>
        <template v-for="atom in schema.atoms" :key="atom.id">
          <AtomInput
            v-if="isVisible(atom, data)"
            :atom="atom"
            :value="data[atom.name] ?? atom.defaultValue"
            :on-change="(v) => setVal(atom.name, v)"
            :required="isRequired(atom, data)"
            :disabled="isDisabled(atom, data)"
            :error="requiredMessage(atom, data) ?? undefined"
          />
        </template>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import type { FormSchema } from '@/types/formSchema'
import AtomInput from './AtomInput.vue'
import {
  isVisible,
  isRequired,
  isDisabled,
  requiredMessage,
} from '@/lib/formRules'

defineProps<{
  schema: FormSchema
}>()

const data = reactive<Record<string, unknown>>({})

function setVal(name: string, v: unknown) {
  data[name] = v
}
</script>

<style scoped>
.preview {
  padding: 12px;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
  flex-shrink: 0;
}
.title {
  font-size: 12px;
  font-weight: 600;
  color: #0f172a;
  margin-bottom: 8px;
}
.box {
  background: #fff;
  border-radius: 6px;
  padding: 8px 12px;
  max-height: 220px;
  overflow-y: auto;
}
.empty {
  font-size: 12px;
  color: #94a3b8;
  padding: 4px 0;
}
</style>

