<script setup>
    import Konva from 'konva'
    import { onMounted, ref } from 'vue'
    import ColorPalette from './ColorPalette.vue'
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

    const props = defineProps({
        toolbarStyle: Object,
        selectionRect: Object
    })

    let stage = null
    let layer = null
    let drawing = false
    let currentShape = null
    let startPos = null
    let activeTextarea = null
    let activeTextareaHandlers = { keydown: null, blur: null, input: null }
    let activeTextareaStagePos = null

    // state
    const activeTool = ref(null)
    const selectedColor = ref('#2178FF') // default blue
    const showColorPicker = ref(false)
    const blurAreas = ref([]) // Store blur areas for CSS blur effect

    const selectTool = (tool) => {
        activeTool.value = tool
    }

    const clearBlurAreas = () => {
        blurAreas.value = []
    }

    // Expose methods for parent component
    defineExpose({
        clearBlurAreas
    })

    function showTextEditorAt(position) {
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
            padding: '2px 4px',
            margin: '0',
            fontSize: '16px',
            lineHeight: '1.2',
            fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
            resize: 'both',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            minWidth: '40px',
            minHeight: '20px',
            width: '200px',
            maxWidth: `${props.selectionRect.width - position.x - 8}px`,
            backgroundColor: 'rgba(255,255,255,0.01)'
        })

        textarea.rows = 1
        textarea.spellcheck = false
        textarea.wrap = 'soft'

        const maxWidth = props.selectionRect.width - position.x - 8

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
        activeTextareaHandlers.input = () => autosizeTextarea()

        textarea.addEventListener('keydown', activeTextareaHandlers.keydown)
        textarea.addEventListener('blur', activeTextareaHandlers.blur)
        textarea.addEventListener('input', activeTextareaHandlers.input)

        document.body.appendChild(textarea)
        setTimeout(() => {
            if (!textarea) return
            autosizeTextarea()
            textarea.focus()
        }, 0)
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

        if (!commit || isEmpty) return

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
    }

    onMounted(() => {
        stage = new Konva.Stage({
            container: 'selected-area',
            width: props.selectionRect.width,
            height: props.selectionRect.height
        })

        layer = new Konva.Layer()
        stage.add(layer)

        // Handle click tools (text placement, eraser)
        stage.on('click', () => {
            const pointerPos = stage.getPointerPosition()
            if (!pointerPos) return

            if (activeTool.value === 'text') {
                showTextEditorAt(pointerPos)
                return
            }

            if (activeTool.value === 'eraser') {
                // Try to erase a Konva node under the cursor
                const target = stage.getIntersection(pointerPos)
                if (target) {
                    target.destroy()
                    layer.batchDraw()
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
                    blurAreas.value.splice(idx, 1)
                }
                return
            }
        })

        stage.on('mousedown', () => {
            if (!activeTool.value) return
            const pointerPos = stage.getPointerPosition()

            if (activeTool.value === 'text' || activeTool.value === 'eraser') {
                // handled by click handler
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
            if (!drawing || !currentShape) return
            const pos = stage.getPointerPosition()

            if (activeTool.value === 'line' || activeTool.value === 'arrow') {
                currentShape.points([startPos.x, startPos.y, pos.x, pos.y])
            }

            if (activeTool.value === 'rect') {
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
            if (drawing && activeTool.value === 'blur' && currentShape) {
                // Create a CSS blur area
                const rect = currentShape.getClientRect()
                if (rect.width > 5 && rect.height > 5) {
                    // Only create if area is significant
                    blurAreas.value.push({
                        id: Date.now(), // Simple ID
                        x: rect.x,
                        y: rect.y,
                        width: rect.width,
                        height: rect.height
                    })
                }
                // Remove the temporary rectangle
                currentShape.destroy()
                layer.batchDraw()
            }
            drawing = false
            currentShape = null
        })
    })
</script>

<template>
    <!-- Canvas -->
    <div
        :style="{
            width: `${props.selectionRect.width}px`,
            height: `${props.selectionRect.height}px`,
            top: `${props.selectionRect.top}px`,
            left: `${props.selectionRect.left}px`
        }"
        class="fixed"
        id="selected-area"></div>

    <!-- CSS Blur Areas -->
    <div
        v-for="blur in blurAreas"
        :key="blur.id"
        :style="{
            position: 'fixed',
            left: `${props.selectionRect.left + blur.x}px`,
            top: `${props.selectionRect.top + blur.y}px`,
            width: `${blur.width}px`,
            height: `${blur.height}px`,
            backdropFilter: 'blur(5px)',
            WebkitBackdropFilter: 'blur(5px)', // Safari support
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            pointerEvents: 'none',
            zIndex: 45
        }"
        class="blur-area"></div>

    <!-- Toolbar -->
    <div
        :style="toolbarStyle"
        class="fixed z-50 -ml-12 flex gap-4">
        <div class="flex items-center gap-2 rounded-full bg-white px-3 py-1.5">
            <button><UndoIcon /></button>
            <button><RedoIcon /></button>
        </div>

        <div class="flex items-center gap-1 rounded-full bg-white px-4 py-1.5">
            <!-- Line -->
            <button
                class="flex size-6 items-center justify-center rounded"
                @click="selectTool('line')"
                :class="{ 'bg-primary-blue text-white': activeTool === 'line' }">
                <LineIcon />
            </button>

            <!-- Arrow -->
            <button
                class="flex size-6 items-center justify-center rounded"
                @click="selectTool('arrow')"
                :class="{ 'bg-primary-blue text-white': activeTool === 'arrow' }">
                <ArrowIcon />
            </button>

            <!-- Circle -->
            <button
                class="flex size-6 items-center justify-center rounded"
                @click="selectTool('ellipse')"
                :class="{ 'bg-primary-blue text-white': activeTool === 'ellipse' }">
                <EllipseIcon />
            </button>

            <!-- Rectangle -->
            <button
                class="flex size-6 items-center justify-center rounded"
                @click="selectTool('rect')"
                :class="{ 'bg-primary-blue text-white': activeTool === 'rect' }">
                <RectangleIcon />
            </button>

            <!-- Pencil -->
            <button
                class="flex size-6 items-center justify-center rounded"
                @click="selectTool('pencil')"
                :class="{ 'bg-primary-blue text-white': activeTool === 'pencil' }">
                <PencilIcon />
            </button>

            <!-- Highlight -->
            <button
                class="flex size-6 items-center justify-center rounded"
                @click="selectTool('highlighter')"
                :class="{ 'bg-primary-blue text-white': activeTool === 'highlighter' }">
                <HighlighterIcon />
            </button>

            <button
                class="flex size-6 items-center justify-center rounded"
                @click="selectTool('eraser')"
                :class="{ 'bg-primary-blue text-white': activeTool === 'eraser' }">
                <EraserIcon />
            </button>
            <button
                class="flex size-6 items-center justify-center rounded"
                @click="selectTool('blur')"
                :class="{ 'bg-primary-blue text-white': activeTool === 'blur' }">
                <BlurIcon />
            </button>
            <button
                class="flex size-6 items-center justify-center rounded"
                @click="selectTool('text')"
                :class="{ 'bg-primary-blue text-white': activeTool === 'text' }">
                <TextIcon />
            </button>

            <!-- Color Picker -->
            <div class="relative size-5">
                <button
                    @click="showColorPicker = true"
                    class="relative size-5 rounded-full border transition hover:scale-105"
                    :style="{ background: selectedColor }"></button>
                <ColorPalette
                    v-if="showColorPicker"
                    :selected="selectedColor"
                    @change="(color) => ((selectedColor = color), (showColorPicker = false))" />
            </div>
        </div>

        <div class="flex items-center gap-2 rounded-full bg-white px-3 py-1.5">
            <button
                @click="$emit('cancel')"
                class="text-red-500">
                <DeleteIcon />
            </button>
            <button
                @click="$emit('save')"
                class="text-green-600">
                <CheckIcon />
            </button>
        </div>
    </div>
</template>
