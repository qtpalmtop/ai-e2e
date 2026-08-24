// 节点类型 → Vue 组件 映射
// 在 FlowCanvas 中通过 :node-types 传给 <VueFlow>
import StartNode from './StartNode.vue'
import EndNode from './EndNode.vue'
import OpenPageNode from './OpenPageNode.vue'
import InputTextNode from './InputTextNode.vue'
import ClickElementNode from './ClickElementNode.vue'
import HoverElementNode from './HoverElementNode.vue'
import WaitNode from './WaitNode.vue'
import ConditionNode from './ConditionNode.vue'
import LoopNode from './LoopNode.vue'

export const nodeTypes = {
  start: StartNode,
  end: EndNode,
  openPage: OpenPageNode,
  inputText: InputTextNode,
  clickElement: ClickElementNode,
  hoverElement: HoverElementNode,
  wait: WaitNode,
  condition: ConditionNode,
  loop: LoopNode,
}
