<!--
  OptionEditor 子组件（AtomInspector 内部用）
  - select 类型原子的选项列表编辑
  - 每行：label 输入 + value 输入 + 删除按钮
  - 底部：+ 添加选项
-->
<template>
  <div>
    <div v-for="(o, i) in options" :key="i" class="opt-row">
      <input
        class="ctrl"
        style="flex: 1"
        :value="o.label"
        placeholder="label"
        @input="(e) => update(i, 'label', (e.target as HTMLInputElement).value)"
      />
      <input
        class="ctrl"
        style="flex: 1"
        :value="String(o.value)"
        placeholder="value"
        @input="(e) => update(i, 'value', (e.target as HTMLInputElement).value)"
      />
      <button
        class="del-btn"
        title="删除"
        @click="remove(i)"
      >×</button>
    </div>
    <button class="add-btn" @click="add">+ 添加选项</button>
  </div>
</template>

<script setup lang="ts">
import type { SelectOption } from '@/types/formSchema'

const props = defineProps<{
  options: SelectOption[]
}>()

const emit = defineEmits<{
  (e: 'change', opts: SelectOption[]): void
}>()

function update(i: number, k: 'label' | 'value', v: string) {
  const next = props.options.slice()
  next[i] = { ...next[i], [k]: v }
  emit('change', next)
}

function remove(i: number) {
  emit(
    'change',
    props.options.filter((_, j) => j !== i),
  )
}

function add() {
  emit('change', [
    ...props.options,
    {
      label: `选项${props.options.length + 1}`,
      value: `opt${props.options.length + 1}`,
    },
  ])
}
</script>

<style scoped>
.opt-row {
  display: flex;
  gap: 4px;
  margin-bottom: 4px;
}
.del-btn {
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: #ef4444;
  cursor: pointer;
  font-size: 14px;
  flex-shrink: 0;
}
.add-btn {
  font-size: 11px;
  padding: 2px 8px;
  border: 1px dashed #cbd5e1;
  background: #fff;
  border-radius: 4px;
  cursor: pointer;
  color: #64748b;
}
.add-btn:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}
.ctrl {
  width: 100%;
  padding: 4px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  font-size: 12px;
  outline: none;
  box-sizing: border-box;
  background: #fff;
  color: #0f172a;
}
</style>
