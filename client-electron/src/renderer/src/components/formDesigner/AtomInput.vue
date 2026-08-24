<!--
  原子渲染器：单一组件支持 9 种原子类型
  - text / url / selector: 单行输入
  - textarea / code: 多行（code 用等宽字体）
  - number / delay: 数字
  - select: 下拉
  - boolean: 复选框
  渲染层不感知规则 — visible / required / disabled 由调用方计算后传入
-->
<template>
  <!-- 布尔不需要 label 行 -->
  <div v-if="atom.type === 'boolean'" class="atom-field">
    <label class="boolean-row">
      <input
        type="checkbox"
        :checked="Boolean(value)"
        :disabled="disabled"
        @change="(e) => onChange((e.target as HTMLInputElement).checked)"
      />
      <span class="boolean-label">{{ atom.label }}</span>
    </label>
    <div v-if="atom.help" class="help">{{ atom.help }}</div>
    <div v-if="error" class="err">{{ error }}</div>
  </div>

  <div v-else class="atom-field">
    <label class="label">
      {{ atom.label }}
      <span v-if="required" class="required">*</span>
    </label>
    <input
      v-if="atom.type === 'text' || atom.type === 'url' || atom.type === 'selector'"
      :class="['ctrl', error ? 'ctrl-err' : '']"
      :value="(value as string) ?? ''"
      :placeholder="atom.placeholder"
      :disabled="disabled"
      @input="(e) => onChange((e.target as HTMLInputElement).value)"
    />
    <textarea
      v-else-if="atom.type === 'textarea' || atom.type === 'code'"
      :class="['ctrl', 'ctrl-area', error ? 'ctrl-err' : '']"
      :style="{ fontFamily: atom.type === 'code' ? 'monospace' : 'inherit' }"
      :value="(value as string) ?? ''"
      :placeholder="atom.placeholder"
      :disabled="disabled"
      @input="(e) => onChange((e.target as HTMLTextAreaElement).value)"
    />
    <input
      v-else-if="atom.type === 'number' || atom.type === 'delay'"
      type="number"
      :class="['ctrl', error ? 'ctrl-err' : '']"
      :value="value === undefined || value === null ? '' : Number(value)"
      :min="atom.min"
      :max="atom.max"
      :step="atom.step ?? 1"
      :placeholder="atom.placeholder"
      :disabled="disabled"
      @input="(e) => onChange((e.target as HTMLInputElement).value === '' ? undefined : Number((e.target as HTMLInputElement).value))"
    />
    <select
      v-else-if="atom.type === 'select'"
      :class="['ctrl', error ? 'ctrl-err' : '']"
      :value="(value as string | number) ?? ''"
      :disabled="disabled"
      @change="(e) => onChange((e.target as HTMLSelectElement).value)"
    >
      <option value="" disabled>请选择…</option>
      <option v-for="o in atom.options ?? []" :key="String(o.value)" :value="o.value">
        {{ o.label }}
      </option>
    </select>
    <div v-if="atom.help" class="help">{{ atom.help }}</div>
    <div v-if="error" class="err">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import type { FormAtom } from '@/types/formSchema'

defineProps<{
  atom: FormAtom
  value: unknown
  onChange: (v: unknown) => void
  disabled?: boolean
  required?: boolean
  error?: string
}>()
</script>

<style scoped>
.atom-field {
  margin-bottom: 12px;
}
.label {
  display: block;
  font-size: 12px;
  color: #334155;
  margin-bottom: 4px;
}
.required {
  color: #ef4444;
  margin-left: 4px;
}
.ctrl {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
  background: #fff;
  color: #0f172a;
}
.ctrl:disabled {
  background: #f1f5f9;
  color: #94a3b8;
  cursor: not-allowed;
}
.ctrl-area {
  min-height: 60px;
  resize: vertical;
}
.ctrl-err {
  border-color: #ef4444;
}
.boolean-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
}
.boolean-label {
  color: #64748b;
}
.help {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 4px;
}
.err {
  font-size: 12px;
  color: #ef4444;
  margin-top: 4px;
}
</style>
