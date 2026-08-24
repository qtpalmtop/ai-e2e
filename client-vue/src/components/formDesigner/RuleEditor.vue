<!--
  联动规则编辑器
  给一个原子添加 / 编辑 / 删除 visible / required / disabled 规则
-->
<template>
  <div v-if="candidateFields.length === 0" class="hint">
    添加更多原子后才能配置联动
  </div>
  <div v-else class="panel">
    <div class="head">
      <div class="title">联动规则</div>
      <button v-if="!show && atom.rules.length === 0" class="add-btn" @click="add">
        + 添加
      </button>
    </div>
    <div v-if="show || atom.rules.length > 0">
      <div v-for="(r, i) in atom.rules" :key="i" class="rule">
        <select
          :value="r.type"
          class="sel"
          @change="(e) => update(i, { ...r, type: (e.target as HTMLSelectElement).value as LinkRule['type'] })"
        >
          <option v-for="t in RULE_TYPES" :key="t" :value="t">
            {{ TYPE_LABELS[t] }}当
          </option>
        </select>
        <select
          :value="r.when.field"
          class="sel"
          @change="(e) => update(i, { ...r, when: { ...r.when, field: (e.target as HTMLSelectElement).value } })"
        >
          <option value="">选择字段…</option>
          <option v-for="f in candidateFields" :key="f.id" :value="f.name">
            {{ f.label }}
          </option>
        </select>
        <select
          :value="r.when.op"
          class="sel narrow"
          @change="(e) => update(i, { ...r, when: { ...r.when, op: (e.target as HTMLSelectElement).value as LinkOp } })"
        >
          <option v-for="(label, op) in OP_LABELS" :key="op" :value="op">
            {{ label }}
          </option>
        </select>

        <!-- value 输入：根据 op 和字段类型显示不同控件 -->
        <template v-if="needValue(r)">
          <select
            v-if="isSelectValueField(r)"
            :value="String(r.when.value ?? '')"
            class="sel"
            @change="(e) => update(i, { ...r, when: { ...r.when, value: (e.target as HTMLSelectElement).value } })"
          >
            <option value="">值…</option>
            <option
              v-for="o in valueFieldOptions(r)"
              :key="String(o.value)"
              :value="String(o.value)"
            >
              {{ o.label }}
            </option>
          </select>
          <input
            v-else
            :value="String(r.when.value ?? '')"
            class="inp"
            placeholder="值"
            @input="(e) => update(i, { ...r, when: { ...r.when, value: (e.target as HTMLInputElement).value } })"
          />
        </template>
        <span v-else />

        <button
          class="del"
          title="删除规则"
          @click="() => { remove(i); if (atom.rules.length === 1) show = false }"
        >
          ×
        </button>

        <input
          v-if="r.type === 'required'"
          :value="r.message ?? ''"
          class="inp msg"
          placeholder="错误提示（可选）"
          @input="(e) => update(i, { ...r, message: (e.target as HTMLInputElement).value })"
        />
      </div>
      <button class="add-more" @click="add">+ 再加一条</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { FormAtom, LinkRule, LinkOp } from '@/types/formSchema'
import { OP_LABELS } from '@/lib/formRules'

const props = defineProps<{
  atom: FormAtom
  candidateFields: FormAtom[]
}>()

const emit = defineEmits<{
  (e: 'change', rules: LinkRule[]): void
}>()

const RULE_TYPES: LinkRule['type'][] = ['visible', 'required', 'disabled']

const TYPE_LABELS: Record<LinkRule['type'], string> = {
  visible: '显示',
  required: '必填',
  disabled: '禁用',
}

const show = ref(props.atom.rules.length > 0)

function needValue(r: LinkRule): boolean {
  return r.when.op !== 'truthy' && r.when.op !== 'falsy'
}

function valueField(r: LinkRule): FormAtom | undefined {
  return props.candidateFields.find((f) => f.name === r.when.field)
}

function isSelectValueField(r: LinkRule): boolean {
  return valueField(r)?.type === 'select'
}

function valueFieldOptions(r: LinkRule) {
  return valueField(r)?.options ?? []
}

function add() {
  const first = props.candidateFields[0]
  if (!first) return
  emit('change', [
    ...props.atom.rules,
    { type: 'visible', when: { field: first.name, op: 'eq', value: '' } },
  ])
  show.value = true
}

function update(i: number, r: LinkRule) {
  const next = props.atom.rules.slice()
  next[i] = r
  emit('change', next)
}

function remove(i: number) {
  const next = props.atom.rules.slice()
  next.splice(i, 1)
  emit('change', next)
}
</script>

<style scoped>
.hint {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 4px;
}
.panel {
  margin-top: 8px;
  padding: 8px;
  background: #f8fafc;
  border-radius: 6px;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.title {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
}
.add-btn {
  font-size: 11px;
  padding: 2px 8px;
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 4px;
  cursor: pointer;
  color: #0f172a;
}
.rule {
  display: grid;
  grid-template-columns: 60px 1fr 80px 1fr 24px;
  gap: 6px;
  align-items: center;
  margin-bottom: 6px;
  font-size: 12px;
}
.rule .msg {
  grid-column: 2 / span 4;
  color: #64748b;
  font-size: 11px;
}
.sel {
  padding: 3px 6px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #fff;
}
.inp {
  padding: 3px 6px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  font-size: 12px;
  background: #fff;
  color: #0f172a;
  outline: none;
}
.inp.msg {
  border-color: #e2e8f0;
}
.del {
  border: none;
  background: transparent;
  color: #ef4444;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}
.add-more {
  font-size: 11px;
  padding: 2px 8px;
  border: 1px dashed #cbd5e1;
  background: #fff;
  border-radius: 4px;
  cursor: pointer;
  color: #64748b;
}
</style>
