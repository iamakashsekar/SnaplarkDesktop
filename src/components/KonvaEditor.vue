<script setup>
import Konva from 'konva'
import { onMounted, onUnmounted, ref, computed } from 'vue'
import ColorPalette from './ColorPalette.vue'
import Tooltip from './Tooltip.vue'
import UndoIcon from './icons/UndoIcon.vue'
import RedoIcon from './icons/RedoIcon.vue'
import ArrowIcon from './icons/ArrowIcon.vue'
import LineIcon from './icons/LineIcon.vue'
import EllipseIcon from './icons/EllipseIcon.vue'
import RectangleIcon from './icons/RectangleIcon.vue'
import PencilIcon from './icons/PencilIcon.vue'
import HighlighterIcon from './icons/HighlighterIcon.vue'
import EraserIcon from './icons/EraserIcon.vue'
import BlurIcon from './icons/BlurIcon.vue'
import TextIcon from './icons/TextIcon.vue'
import DeleteIcon from './icons/DeleteIcon.vue'
import CheckIcon from './icons/CheckIcon.vue'
import { useStore } from '@/store'

const props = defineProps({
    toolbarStyle: Object,
    selectionRect: Object,
    editable: Boolean,
    backgroundSrc: String
})

const store = useStore()

let stage = null
let layer = null
let drawing = false
let currentShape = null
let startPos = null
let activeTextarea = null
let activeTextareaHandlers = { keydown: null, blur: null, input: null }
let activeTextareaStagePos = null
let activeTextNodeRef = null
let activeTextGroupRef = null
let transformer = null
const isEditingText = ref(false)
let editingGroupRef = null

// state
const activeTool = ref(null)
const selectedColor = ref('#2178FF') // default blue
const showColorPicker = ref(false)
const blurAreas = ref([]) // Store blur areas for CSS blur effect
const canUndo = ref(false)
const canRedo = ref(false)

// Toolbar dragging state
const customToolbarPosition = ref(null)
const isDraggingToolbar = ref(false)
const toolbarDragStart = ref({ x: 0, y: 0 })

// history stacks
const history = []
const redoStack = []

function updateUndoRedoState() {
    canUndo.value = history.length > 0
    canRedo.value = redoStack.length > 0
}

function pushHistory(entry) {
    history.push(entry)
    redoStack.length = 0
    updateUndoRedoState()
}

function undo() {
    if (!history.length) return
    const entry = history.pop()
    if (!entry) return
    switch (entry.type) {
        case 'node_add': {
            if (entry.node && entry.node.remove) entry.node.remove()
            layer && layer.batchDraw && layer.batchDraw()
            redoStack.push(entry)
            if (transformer) transformer.nodes([])
            break
        }
        case 'node_remove': {
            if (entry.node && entry.parent) {
                entry.node.moveTo(entry.parent)
                if (typeof entry.zIndex === 'number' && entry.node.setZIndex) {
                    entry.node.setZIndex(entry.zIndex)
                }
            }
            layer && layer.batchDraw && layer.batchDraw()
            redoStack.push(entry)
            if (transformer) transformer.nodes([])
            break
        }
        case 'blur_add': {
            const idx = blurAreas.value.findIndex((b) => b.id === entry.blur.id)
            if (idx !== -1) blurAreas.value.splice(idx, 1)
            redoStack.push(entry)
            if (transformer) transformer.nodes([])
            break
        }
        case 'blur_remove': {
            const insertAt = typeof entry.index === 'number' ? entry.index : blurAreas.value.length
            blurAreas.value.splice(insertAt, 0, entry.blur)
            redoStack.push(entry)
            if (transformer) transformer.nodes([])
            break
        }
    }
    updateUndoRedoState()
}

function redo() {
    if (!redoStack.length) return
    const entry = redoStack.pop()
    if (!entry) return
    switch (entry.type) {
        case 'node_add': {
            if (entry.node && entry.parent) {
                entry.node.moveTo(entry.parent)
                if (typeof entry.zIndex === 'number' && entry.node.setZIndex) {
                    entry.node.setZIndex(entry.zIndex)
                }
            }
            layer && layer.batchDraw && layer.batchDraw()
            history.push(entry)
            if (transformer) transformer.nodes([])
            break
        }
        case 'node_remove': {
            if (entry.node && entry.node.remove) entry.node.remove()
            layer && layer.batchDraw && layer.batchDraw()
            history.push(entry)
            if (transformer) transformer.nodes([])
            break
        }
        case 'blur_add': {
            const insertAt = typeof entry.index === 'number' ? entry.index : blurAreas.value.length
            blurAreas.value.splice(insertAt, 0, entry.blur)
            history.push(entry)
            if (transformer) transformer.nodes([])
            break
        }
        case 'blur_remove': {
            const idx = blurAreas.value.findIndex((b) => b.id === entry.blur.id)
            if (idx !== -1) blurAreas.value.splice(idx, 1)
            history.push(entry)
            if (transformer) transformer.nodes([])
            break
        }
    }
    updateUndoRedoState()
}

const selectTool = (tool) => {
    activeTool.value = tool
}

const clearBlurAreas = () => {
    blurAreas.value = []
}

// Computed toolbar style with custom position support
const computedToolbarStyle = computed(() => {
    // If user has custom position, use that
    if (customToolbarPosition.value) {
        return {
            left: `${customToolbarPosition.value.x}px`,
            top: `${customToolbarPosition.value.y}px`
        }
    }
    // Otherwise, use the prop's toolbar style
    return props.toolbarStyle
})

// Toolbar dragging handlers
let dragOffsetX = 0
let dragOffsetY = 0

const handleToolbarDragMove = (e) => {
    if (!isDraggingToolbar.value) return

    e.preventDefault()

    // Calculate new position
    let newX = e.clientX - dragOffsetX
    let newY = e.clientY - dragOffsetY

    // Keep toolbar within viewport bounds (with some padding)
    const margin = 10
    const toolbarWidth = 520
    const toolbarHeight = 50

    newX = Math.max(margin, Math.min(newX, window.innerWidth - toolbarWidth - margin))
    newY = Math.max(margin, Math.min(newY, window.innerHeight - toolbarHeight - margin))

    customToolbarPosition.value = { x: newX, y: newY }
}

const handleToolbarDragEnd = () => {
    if (!isDraggingToolbar.value) return
    isDraggingToolbar.value = false
    document.removeEventListener('mousemove', handleToolbarDragMove)
    document.removeEventListener('mouseup', handleToolbarDragEnd)
}

const handleToolbarDragStart = (e) => {
    e.stopPropagation()
    e.preventDefault()

    // Clean up any stale listeners first (safety measure)
    document.removeEventListener('mousemove', handleToolbarDragMove)
    document.removeEventListener('mouseup', handleToolbarDragEnd)

    // Get the toolbar container
    const toolbar = e.currentTarget.closest('.toolbar-container')
    if (!toolbar) return

    const rect = toolbar.getBoundingClientRect()

    // Store the offset from mouse to toolbar top-left
    dragOffsetX = e.clientX - rect.left
    dragOffsetY = e.clientY - rect.top

    isDraggingToolbar.value = true

    // Add document-level listeners for drag
    document.addEventListener('mousemove', handleToolbarDragMove)
    document.addEventListener('mouseup', handleToolbarDragEnd)
}

// Expose methods for parent component
defineExpose({
    clearBlurAreas,
    exportPNG: (options = {}) => {
        if (!stage) return null
        const defaultOptions = {
            pixelRatio: window.devicePixelRatio || 1,
            mimeType: 'image/png'
        }
        return stage.toDataURL({ ...defaultOptions, ...options })
    },
    getBlurAreas: () => blurAreas.value.slice()
})

function showTextEditorAt(position, opts = {}) {
    if (!props.editable) return
    if (activeTextarea) {
        // If an editor is already open, commit/cancel it first
        finalizeTextEditor()
    }

    activeTextareaStagePos = { x: position.x, y: position.y }

    const textarea = document.createElement('textarea')
    activeTextarea = textarea

    const left = props.selectionRect.left + position.x
    const top = props.selectionRect.top + position.y

    Object.assign(textarea.style, {
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        zIndex: 60,
        color: selectedColor.value,
        background: 'transparent',
        border: '1px dashed rgba(0,0,0,0.25)',
        outline: 'none',
        padding: '0px',
        margin: '0',
        fontSize: '16px',
        lineHeight: '1.2',
        fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        resize: opts.allowResize ? 'both' : 'none',
        overflow: 'auto',
        boxSizing: 'border-box',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        minWidth: '40px',
        minHeight: '20px',
        width: opts.width ? `${opts.width}px` : '200px',
        height: opts.height ? `${opts.height}px` : '',
        maxWidth: `${Math.min(props.selectionRect.width - position.x - 8, opts.width || Infinity)}px`,
        backgroundColor: 'rgba(255,255,255,0.01)'
    })

    textarea.rows = 1
    textarea.spellcheck = false
    textarea.wrap = 'soft'
    const maxWidth = Math.min(props.selectionRect.width - position.x - 8, opts.width || Infinity)

    function autosizeTextarea() {
        if (!activeTextarea) return
        textarea.style.height = 'auto'
        const targetHeight = Math.max(textarea.scrollHeight, 20)
        const currentHeight = parseFloat(window.getComputedStyle(textarea).height)
        if (isNaN(currentHeight) || targetHeight > currentHeight) {
            textarea.style.height = `${targetHeight}px`
        }
    }

    activeTextareaHandlers.keydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            finalizeTextEditor(true)
        } else if (e.key === 'Escape') {
            e.preventDefault()
            finalizeTextEditor(false)
        }
    }

    activeTextareaHandlers.blur = () => finalizeTextEditor(true)
    if (!opts.fixedSize) {
        activeTextareaHandlers.input = () => autosizeTextarea()
    }

    textarea.addEventListener('keydown', activeTextareaHandlers.keydown)
    textarea.addEventListener('blur', activeTextareaHandlers.blur)
    if (activeTextareaHandlers.input) textarea.addEventListener('input', activeTextareaHandlers.input)

    document.body.appendChild(textarea)
    if (typeof opts.initialValue === 'string') {
        textarea.value = opts.initialValue
    }
    setTimeout(() => {
        if (!textarea) return
        if (!opts.fixedSize) autosizeTextarea()
        textarea.focus()
    }, 0)
}

function openEditorForTextGroup(group) {
    if (!props.editable) return
    if (!group) return
    const textNode = group.findOne('Text')
    if (!textNode) return
    activeTool.value = null
    activeTextNodeRef = textNode
    activeTextGroupRef = group
    textNode.visible(false)
    layer.batchDraw()
    // Hide transformer while editing for stability
    transformer.nodes([])
    const gx = group.x()
    const gy = group.y()
    const rectNode = group.findOne('Rect')
    const gw = rectNode ? rectNode.width() : group.width()
    const gh = rectNode ? rectNode.height() : group.height()
    showTextEditorAt(
        { x: gx, y: gy },
        {
            width: gw,
            height: gh,
            allowResize: false,
            fixedSize: true,
            initialValue: textNode.text()
        }
    )
    isEditingText.value = true
    editingGroupRef = group
    // Show transformer on the group while editing, but it will not interfere visually with overlay
    transformer.nodes([group])
    layer.batchDraw()
}

function cleanupActiveTextarea() {
    if (!activeTextarea) return
    if (activeTextareaHandlers.keydown)
        activeTextarea.removeEventListener('keydown', activeTextareaHandlers.keydown)
    if (activeTextareaHandlers.blur) activeTextarea.removeEventListener('blur', activeTextareaHandlers.blur)
    if (activeTextareaHandlers.input) activeTextarea.removeEventListener('input', activeTextareaHandlers.input)
    if (activeTextarea.parentNode) activeTextarea.parentNode.removeChild(activeTextarea)
    activeTextarea = null
    activeTextareaHandlers = { keydown: null, blur: null, input: null }
    activeTextareaStagePos = null
    isEditingText.value = false
    if (transformer) {
        transformer.nodes([])
    }
    editingGroupRef = null
}

function finalizeTextEditor(commit = true) {
    if (!activeTextarea) return
    const rawText = activeTextarea.value || ''
    const isEmpty = rawText.trim().length === 0
    const position = activeTextareaStagePos
    const color = selectedColor.value
    const widthPx = activeTextarea.clientWidth
    const heightPx = activeTextarea.clientHeight

    cleanupActiveTextarea()
    activeTool.value = null
    if (transformer) transformer.nodes([])

    if (!commit || isEmpty) {
        activeTextNodeRef = null
        activeTextGroupRef = null
        return
    }

    if (activeTextNodeRef && activeTextGroupRef) {
        const rectNode = activeTextGroupRef.findOne('Rect')
        const newW = rectNode.width()
        const newH = rectNode.height()
        activeTextNodeRef.fill(color)
        activeTextNodeRef.width(newW)
        activeTextNodeRef.height(newH)
        activeTextNodeRef.text(rawText)
        activeTextNodeRef.wrap('word')
        activeTextGroupRef.clip({ x: 0, y: 0, width: newW, height: newH })
        activeTextNodeRef.visible(true)
        if (transformer) transformer.nodes([])
        layer.batchDraw()
        activeTextNodeRef = null
        activeTextGroupRef = null
        return
    }

    // Fallback: point text (if ever invoked)
    const textNode = new Konva.Text({
        x: position.x,
        y: position.y,
        text: rawText,
        fontSize: 16,
        lineHeight: 1.2,
        fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        fill: color,
        width: widthPx,
        align: 'left',
        draggable: true
    })
    layer.add(textNode)
    layer.batchDraw()
    pushHistory({ type: 'node_add', node: textNode, parent: layer, zIndex: textNode.zIndex() })
}

let bgImageObj = null

onMounted(() => {
    stage = new Konva.Stage({
        container: 'selected-area',
        width: props.selectionRect.width,
        height: props.selectionRect.height
    })

    layer = new Konva.Layer()
    stage.add(layer)

    if (props.backgroundSrc) {
        bgImageObj = new Image()
        bgImageObj.onload = () => {
            const bg = new Konva.Image({
                image: bgImageObj,
                x: 0,
                y: 0,
                width: stage.width(),
                height: stage.height()
            })
            layer.add(bg)
            bg.moveToBottom()
            layer.batchDraw()
        }
        bgImageObj.src = props.backgroundSrc
    }
    transformer = new Konva.Transformer({
        rotateEnabled: false,
        enabledAnchors: [
            'top-left',
            'top-center',
            'top-right',
            'middle-left',
            'middle-right',
            'bottom-left',
            'bottom-center',
            'bottom-right'
        ],
        anchorSize: 6,
        ignoreStroke: true
    })
    layer.add(transformer)

    // Handle click tools (eraser) and deselect transformer on background click
    stage.on('click', (evt) => {
        if (!props.editable) return
        const pointerPos = stage.getPointerPosition()
        if (!pointerPos) return
        if (evt && evt.target === stage) {
            if (!isEditingText.value) transformer.nodes([])
        }

        if (activeTool.value === 'eraser') {
            // Try to erase a Konva node under the cursor
            let target = stage.getIntersection(pointerPos)
            if (target) {
                const textGroup = target.findAncestors((n) => n.getAttr && n.getAttr('isTextGroup'))[0]
                const nodeToRemove = textGroup || target
                const parent = nodeToRemove.getLayer() || layer
                const z = typeof nodeToRemove.zIndex === 'function' ? nodeToRemove.zIndex() : undefined
                pushHistory({ type: 'node_remove', node: nodeToRemove, parent, zIndex: z })
                nodeToRemove.destroy()
                layer.batchDraw()
                if (!isEditingText.value) transformer.nodes([])
                return
            }

            // If no node, try to erase a CSS blur area at this point
            const idx = blurAreas.value.findIndex(
                (b) =>
                    pointerPos.x >= b.x &&
                    pointerPos.x <= b.x + b.width &&
                    pointerPos.y >= b.y &&
                    pointerPos.y <= b.y + b.height
            )
            if (idx !== -1) {
                const removed = blurAreas.value.splice(idx, 1)[0]
                pushHistory({ type: 'blur_remove', blur: removed, index: idx })
            }
            if (!isEditingText.value) transformer.nodes([])
            return
        }
    })

    stage.on('mousedown', (e) => {
        if (!props.editable || !activeTool.value) return
        const pointerPos = stage.getPointerPosition()

        // deselect transformer when clicking empty area
        if (e && e.target === stage) {
            transformer.nodes([])
        }

        if (activeTool.value === 'eraser') {
            // handled by click handler
            return
        }

        if (activeTool.value === 'text') {
            drawing = true
            startPos = pointerPos
            currentShape = new Konva.Rect({
                x: startPos.x,
                y: startPos.y,
                width: 0,
                height: 0,
                fill: 'transparent',
                stroke: selectedColor.value,
                dash: [4, 4],
                strokeWidth: 1
            })
            layer.add(currentShape)
            return
        }

        drawing = true
        startPos = pointerPos

        // Line
        if (activeTool.value === 'line') {
            currentShape = new Konva.Line({
                points: [startPos.x, startPos.y, startPos.x, startPos.y],
                stroke: selectedColor.value,
                strokeWidth: 2
            })
        }

        // Arrow
        if (activeTool.value === 'arrow') {
            currentShape = new Konva.Arrow({
                points: [startPos.x, startPos.y, startPos.x, startPos.y],
                stroke: selectedColor.value,
                fill: selectedColor.value,
                strokeWidth: 2,
                pointerLength: 10,
                pointerWidth: 10
            })
        }

        // Rectangle
        if (activeTool.value === 'rect') {
            currentShape = new Konva.Rect({
                x: startPos.x,
                y: startPos.y,
                width: 0,
                height: 0,
                stroke: selectedColor.value,
                strokeWidth: 2
            })
        }

        // Ellipse
        if (activeTool.value === 'ellipse') {
            currentShape = new Konva.Ellipse({
                x: startPos.x,
                y: startPos.y,
                radiusX: 0,
                radiusY: 0,
                stroke: selectedColor.value,
                strokeWidth: 2
            })
        }

        // Pencil (freehand)
        if (activeTool.value === 'pencil') {
            currentShape = new Konva.Line({
                points: [startPos.x, startPos.y],
                stroke: selectedColor.value,
                strokeWidth: 2,
                lineCap: 'round',
                lineJoin: 'round',
                tension: 0.5, // smooth lines
                globalCompositeOperation: 'source-over' // keep normal blending
            })
        }

        // highlighter
        if (activeTool.value === 'highlighter') {
            currentShape = new Konva.Line({
                points: [startPos.x, startPos.y],
                stroke: selectedColor.value,
                strokeWidth: 15, // wider stroke for highlighter
                opacity: 0.3, // transparent look
                lineCap: 'round',
                lineJoin: 'round',
                globalCompositeOperation: 'multiply'
            })
        }

        // Blur tool - using CSS blur effect
        if (activeTool.value === 'blur') {
            // Create a transparent rectangle for positioning
            currentShape = new Konva.Rect({
                x: startPos.x,
                y: startPos.y,
                width: 0,
                height: 0,
                fill: 'transparent',
                stroke: 'rgba(100, 100, 100, 0.8)',
                strokeWidth: 2
            })
        }

        if (currentShape) {
            layer.add(currentShape)
        }
    })

    stage.on('mousemove', () => {
        if (!props.editable || !drawing || !currentShape) return
        const pos = stage.getPointerPosition()

        if (activeTool.value === 'line' || activeTool.value === 'arrow') {
            currentShape.points([startPos.x, startPos.y, pos.x, pos.y])
        }

        if (activeTool.value === 'rect' || activeTool.value === 'text') {
            const newWidth = pos.x - startPos.x
            const newHeight = pos.y - startPos.y
            currentShape.setAttrs({
                x: Math.min(startPos.x, pos.x),
                y: Math.min(startPos.y, pos.y),
                width: Math.abs(newWidth),
                height: Math.abs(newHeight)
            })
        }

        if (activeTool.value === 'ellipse') {
            const width = pos.x - startPos.x
            const height = pos.y - startPos.y
            currentShape.setAttrs({
                x: startPos.x + width / 2,
                y: startPos.y + height / 2,
                radiusX: Math.abs(width / 2),
                radiusY: Math.abs(height / 2)
            })
        }

        if (activeTool.value === 'pencil' || activeTool.value === 'highlighter') {
            const oldPoints = currentShape.points()
            currentShape.points([...oldPoints, pos.x, pos.y])
        }

        if (activeTool.value === 'blur') {
            const newWidth = pos.x - startPos.x
            const newHeight = pos.y - startPos.y
            currentShape.setAttrs({
                x: Math.min(startPos.x, pos.x),
                y: Math.min(startPos.y, pos.y),
                width: Math.abs(newWidth),
                height: Math.abs(newHeight)
            })
        }

        layer.batchDraw()
    })

    stage.on('mouseup', () => {
        if (!props.editable) return
        if (drawing && activeTool.value === 'blur' && currentShape) {
            const rect = currentShape.getClientRect()
            // Remove the temporary rectangle
            currentShape.destroy()

            if (bgImageObj && rect.width > 5 && rect.height > 5) {
                // Calculate the scale factor between the background image and the stage
                const scaleX = bgImageObj.naturalWidth / stage.width()
                const scaleY = bgImageObj.naturalHeight / stage.height()
                // Use the larger scale factor to ensure blur is effective on HiDPI displays
                const blurScale = Math.max(scaleX, scaleY, 1)

                const blurred = new Konva.Image({
                    image: bgImageObj,
                    x: Math.round(rect.x),
                    y: Math.round(rect.y),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
                    crop: {
                        x: Math.round(rect.x * scaleX),
                        y: Math.round(rect.y * scaleY),
                        width: Math.round(rect.width * scaleX),
                        height: Math.round(rect.height * scaleY)
                    }
                })
                blurred.cache()
                blurred.filters([Konva.Filters.Blur])
                // Scale blur radius by the image scale factor to ensure consistent blur across displays
                // Base radius of 15 ensures text is unreadable even at lower DPR
                blurred.blurRadius(15 * blurScale)
                layer.add(blurred)
                pushHistory({ type: 'node_add', node: blurred, parent: layer, zIndex: blurred.zIndex() })
                layer.batchDraw()
            } else {
                // Fallback to CSS blur area
                if (rect.width > 5 && rect.height > 5) {
                    const blurObj = {
                        id: Date.now(),
                        x: rect.x,
                        y: rect.y,
                        width: rect.width,
                        height: rect.height
                    }
                    blurAreas.value.push(blurObj)
                    pushHistory({ type: 'blur_add', blur: blurObj, index: blurAreas.value.length - 1 })
                }
                layer.batchDraw()
            }
        } else if (drawing && activeTool.value === 'text' && currentShape) {
            const rect = currentShape.getClientRect()
            const width = Math.max(240, Math.round(rect.width))
            const height = Math.max(120, Math.round(rect.height))
            const x = Math.max(0, Math.round(rect.x))
            const y = Math.max(0, Math.round(rect.y))
            currentShape.destroy()

            // Clamp to canvas boundaries
            const clampedWidth = Math.min(width, stage.width() - x)
            const clampedHeight = Math.min(height, stage.height() - y)

            const textGroup = new Konva.Group({
                x,
                y,
                draggable: props.editable,
                isTextGroup: true,
                dragBoundFunc: function (pos) {
                    const rectNode = this.findOne('Rect')
                    const w = rectNode ? rectNode.width() : 0
                    const h = rectNode ? rectNode.height() : 0
                    const newX = Math.max(0, Math.min(pos.x, stage.width() - w))
                    const newY = Math.max(0, Math.min(pos.y, stage.height() - h))
                    return { x: newX, y: newY }
                }
            })
            const bgRect = new Konva.Rect({
                x: 0,
                y: 0,
                width: clampedWidth,
                height: clampedHeight,
                fillEnabled: false,
                strokeWidth: 0,
                listening: true
            })

            const textNode = new Konva.Text({
                x: 0,
                y: 0,
                width: clampedWidth,
                text: '',
                fontSize: 16,
                lineHeight: 1.2,
                fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
                fill: selectedColor.value,
                align: 'left',
                wrap: 'word'
            })

            textGroup.add(bgRect)
            textGroup.add(textNode)
            textGroup.clip({ x: 0, y: 0, width: clampedWidth, height: clampedHeight })
            layer.add(textGroup)

            // Transformer selection
            textGroup.on('mousedown', (evt) => {
                if (!props.editable) return
                if (activeTool.value === 'eraser') return
                transformer.nodes([textGroup])
                evt.cancelBubble = true
            })
            textGroup.on('dblclick', () => props.editable && openEditorForTextGroup(textGroup))

            textGroup.on('transform', () => {
                const rectNode = textGroup.findOne('Rect')
                const scaleX = textGroup.scaleX()
                const scaleY = textGroup.scaleY()
                let newW = Math.max(40, rectNode.width() * scaleX)
                let newH = Math.max(20, rectNode.height() * scaleY)

                // Clamp to stage bounds
                const pos = textGroup.position()
                newW = Math.min(newW, stage.width() - pos.x)
                newH = Math.min(newH, stage.height() - pos.y)

                textGroup.scale({ x: 1, y: 1 })
                rectNode.width(newW)
                rectNode.height(newH)
                textGroup.clip({ x: 0, y: 0, width: newW, height: newH })
                textNode.width(newW)
                textNode.height(newH)
                if (transformer && typeof transformer.forceUpdate === 'function') {
                    transformer.forceUpdate()
                }
                layer.batchDraw()
            })

            // Push history
            pushHistory({ type: 'node_add', node: textGroup, parent: layer, zIndex: textGroup.zIndex() })

            // Show editor overlay within the area and select transformer
            activeTextNodeRef = textNode
            activeTextGroupRef = textGroup
            transformer.nodes([textGroup])
            showTextEditorAt(
                { x, y },
                { width: clampedWidth, height: clampedHeight, allowResize: false, fixedSize: true }
            )
            layer.batchDraw()
            activeTool.value = null
            isEditingText.value = true
        } else if (drawing && currentShape) {
            // finalize shape drawing and push history for node add
            const finalizedShape = currentShape
            // Some tools might create 0-size shapes on accidental clicks; we still allow undo
            pushHistory({ type: 'node_add', node: finalizedShape, parent: layer, zIndex: finalizedShape.zIndex() })
        }
        drawing = false
        currentShape = null
    })
})

onUnmounted(() => {
    // Clean up document-level event listeners if component unmounts during drag
    if (isDraggingToolbar.value) {
        document.removeEventListener('mousemove', handleToolbarDragMove)
        document.removeEventListener('mouseup', handleToolbarDragEnd)
    }
})
</script>

<template>
    <!-- Canvas -->
    <div :style="{
        width: `${props.selectionRect.width}px`,
        height: `${props.selectionRect.height}px`,
        top: `${props.selectionRect.top}px`,
        left: `${props.selectionRect.left}px`,
        zIndex: 99
    }" class="fixed" id="selected-area"></div>

    <!-- Animated Border Around Canvas -->
    <div :style="{
        width: `${props.selectionRect.width}px`,
        height: `${props.selectionRect.height}px`,
        top: `${props.selectionRect.top}px`,
        left: `${props.selectionRect.left}px`,
        zIndex: 100
    }" class="animated-dashed-border pointer-events-none fixed"></div>

    <!-- CSS Blur Areas -->
    <div v-for="blur in blurAreas" :key="blur.id" :style="{
        position: 'fixed',
        left: `${props.selectionRect.left + blur.x}px`,
        top: `${props.selectionRect.top + blur.y}px`,
        width: `${blur.width}px`,
        height: `${blur.height}px`,
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)', // Safari support
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        pointerEvents: 'none',
        zIndex: 45
    }" class="blur-area"></div>

    <!-- Toolbar -->
    <div v-if="props.editable" :style="computedToolbarStyle"
        class="toolbar-container fixed z-102 flex justify-center gap-4 transition-shadow"
        :class="{ 'shadow-2xl': isDraggingToolbar }">
        <!-- Drag Handle -->
        <Tooltip :text="store.settings.showTooltips ? 'Move' : ''">
            <div class="dark:bg-dark-800/90 dark:hover:bg-dark-700 flex cursor-move items-center rounded-full bg-white/90 px-2 py-3 transition-colors hover:bg-gray-100"
                @mousedown="handleToolbarDragStart">
                <svg class="size-5 text-gray-600 transition-colors dark:text-gray-400" viewBox="0 0 24 24"
                    fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="5" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="12" cy="19" r="2" />
                </svg>
            </div>
        </Tooltip>

        <div class="dark:bg-dark-800 flex items-center gap-3 rounded-full bg-white px-4 py-2">
            <Tooltip :text="store.settings.showTooltips ? 'Undo' : ''">
                <button class="flex transition-colors" :class="{
                    'cursor-not-allowed opacity-40': !canUndo,
                    'hover:text-primary-blue cursor-pointer dark:text-gray-400': canUndo
                }" @click="undo" :disabled="!canUndo">
                    <UndoIcon />
                </button>
            </Tooltip>

            <Tooltip :text="store.settings.showTooltips ? 'Redo' : ''">
                <button class="flex transition-colors" :class="{
                    'cursor-not-allowed opacity-40': !canRedo,
                    'hover:text-primary-blue cursor-pointer dark:text-gray-400': canRedo
                }" @click="redo" :disabled="!canRedo">
                    <RedoIcon />
                </button>
            </Tooltip>
        </div>

        <div class="dark:bg-dark-800 flex items-center gap-1 rounded-full bg-white px-4 py-1.5">
            <!-- Line -->
            <Tooltip :text="store.settings.showTooltips ? 'Line' : ''">
                <button class="flex size-6 cursor-pointer items-center justify-center rounded transition-colors"
                    @click="selectTool('line')" :class="{
                        'bg-primary-blue text-white': activeTool === 'line',
                        'hover:text-primary-blue dark:text-gray-400': activeTool !== 'line'
                    }">
                    <LineIcon />
                </button>
            </Tooltip>

            <!-- Arrow -->
            <Tooltip :text="store.settings.showTooltips ? 'Arrow' : ''">
                <button class="flex size-6 cursor-pointer items-center justify-center rounded transition-colors"
                    @click="selectTool('arrow')" :class="{
                        'bg-primary-blue text-white': activeTool === 'arrow',
                        'hover:text-primary-blue dark:text-gray-400': activeTool !== 'arrow'
                    }">
                    <ArrowIcon />
                </button>
            </Tooltip>

            <!-- Circle -->
            <Tooltip :text="store.settings.showTooltips ? 'Circle' : ''">
                <button class="flex size-6 cursor-pointer items-center justify-center rounded transition-colors"
                    @click="selectTool('ellipse')" :class="{
                        'bg-primary-blue text-white': activeTool === 'ellipse',
                        'hover:text-primary-blue dark:text-gray-400': activeTool !== 'ellipse'
                    }">
                    <EllipseIcon />
                </button>
            </Tooltip>

            <!-- Rectangle -->
            <Tooltip :text="store.settings.showTooltips ? 'Rectangle' : ''">
                <button class="flex size-6 cursor-pointer items-center justify-center rounded transition-colors"
                    @click="selectTool('rect')" :class="{
                        'bg-primary-blue text-white': activeTool === 'rect',
                        'hover:text-primary-blue dark:text-gray-400': activeTool !== 'rect'
                    }">
                    <RectangleIcon />
                </button>
            </Tooltip>

            <!-- Pencil -->
            <Tooltip :text="store.settings.showTooltips ? 'Pencil' : ''">
                <button class="flex size-6 cursor-pointer items-center justify-center rounded transition-colors"
                    @click="selectTool('pencil')" :class="{
                        'bg-primary-blue text-white': activeTool === 'pencil',
                        'hover:text-primary-blue dark:text-gray-400': activeTool !== 'pencil'
                    }">
                    <PencilIcon />
                </button>
            </Tooltip>

            <!-- Highlight -->
            <Tooltip :text="store.settings.showTooltips ? 'Highlight' : ''">
                <button class="flex size-6 cursor-pointer items-center justify-center rounded transition-colors"
                    @click="selectTool('highlighter')" :class="{
                        'bg-primary-blue text-white': activeTool === 'highlighter',
                        'hover:text-primary-blue dark:text-gray-400': activeTool !== 'highlighter'
                    }">
                    <HighlighterIcon />
                </button>
            </Tooltip>

            <Tooltip :text="store.settings.showTooltips ? 'Eraser' : ''">
                <button class="flex size-6 cursor-pointer items-center justify-center rounded transition-colors"
                    @click="selectTool('eraser')" :class="{
                        'bg-primary-blue text-white': activeTool === 'eraser',
                        'hover:text-primary-blue dark:text-gray-400': activeTool !== 'eraser'
                    }">
                    <EraserIcon />
                </button>
            </Tooltip>

            <Tooltip :text="store.settings.showTooltips ? 'Blur' : ''">
                <button class="flex size-6 cursor-pointer items-center justify-center rounded transition-colors"
                    @click="selectTool('blur')" :class="{
                        'bg-primary-blue text-white': activeTool === 'blur',
                        'hover:text-primary-blue dark:text-gray-400': activeTool !== 'blur'
                    }">
                    <BlurIcon />
                </button>
            </Tooltip>

            <Tooltip :text="store.settings.showTooltips ? 'Text' : ''">
                <button class="flex size-6 cursor-pointer items-center justify-center rounded transition-colors"
                    @click="selectTool('text')" :class="{
                        'bg-primary-blue text-white': activeTool === 'text',
                        'hover:text-primary-blue dark:text-gray-400': activeTool !== 'text'
                    }">
                    <TextIcon />
                </button>
            </Tooltip>

            <!-- Color Picker -->
            <div class="relative size-5">
                <Tooltip :text="store.settings.showTooltips ? 'Color' : ''">
                    <button @click="showColorPicker = true"
                        class="relative size-5 cursor-pointer rounded-full border transition hover:scale-105"
                        :style="{ background: selectedColor }"></button>
                </Tooltip>
                <ColorPalette v-if="showColorPicker" :selected="selectedColor"
                    @change="(color) => ((selectedColor = color), (showColorPicker = false))" />
            </div>
        </div>

        <div class="dark:bg-dark-800 flex items-center gap-2 rounded-full bg-white px-3 py-1.5">
            <Tooltip :text="store.settings.showTooltips ? 'Delete' : ''">
                <button @click="$emit('cancel')"
                    class="flex cursor-pointer text-red-500 transition-colors hover:text-red-600">
                    <DeleteIcon />
                </button>
            </Tooltip>

            <Tooltip :text="store.settings.showTooltips ? 'Done' : ''">
                <button @click="$emit('save')"
                    class="flex cursor-pointer text-green-500 transition-colors hover:text-green-600">
                    <CheckIcon />
                </button>
            </Tooltip>
        </div>
    </div>
</template>
