<script setup>
    import Konva from 'konva'
    import { onMounted, ref } from 'vue'
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

    // state
    const activeTool = ref(null)
    const selectedColor = ref('#007bff') // default blue

    const selectTool = (tool) => {
        activeTool.value = tool
    }

    onMounted(() => {
        stage = new Konva.Stage({
            container: 'selected-area',
            width: props.selectionRect.width,
            height: props.selectionRect.height
        })

        layer = new Konva.Layer()
        stage.add(layer)

        stage.on('mousedown', () => {
            if (!activeTool.value) return
            drawing = true
            startPos = stage.getPointerPosition()

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
                    tension: 0.5 // smooth lines
                })
            }

            layer.add(currentShape)
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

            if (activeTool.value === 'pencil') {
                const oldPoints = currentShape.points()
                currentShape.points([...oldPoints, pos.x, pos.y])
            }

            layer.batchDraw()
        })

        stage.on('mouseup', () => {
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

    <!-- Toolbar -->
    <div
        :style="toolbarStyle"
        class="fixed z-50 -ml-12 flex gap-4">
        <div class="flex items-center gap-2 rounded-full bg-white px-3 py-1.5">
            <button><UndoIcon /></button>
            <button><RedoIcon /></button>
        </div>

        <div class="flex items-center gap-2 rounded-full bg-white px-4 py-1.5">
            <!-- Tools -->
            <button
                @click="selectTool('line')"
                :class="{ 'text-primary-blue': activeTool === 'line' }">
                <LineIcon />
            </button>
            <button
                @click="selectTool('arrow')"
                :class="{ 'text-primary-blue': activeTool === 'arrow' }">
                <ArrowIcon />
            </button>
            <button
                @click="selectTool('ellipse')"
                :class="{ 'text-primary-blue': activeTool === 'ellipse' }">
                <EllipseIcon />
            </button>
            <button
                @click="selectTool('rect')"
                :class="{ 'text-primary-blue': activeTool === 'rect' }">
                <RectangleIcon />
            </button>

            <!-- Pencil -->
            <button
                @click="selectTool('pencil')"
                :class="{ 'text-primary-blue': activeTool === 'pencil' }">
                <PencilIcon />
            </button>

            <!-- Other future tools -->
            <button><HighlighterIcon /></button>
            <button><EraserIcon /></button>
            <button><BlurIcon /></button>
            <button><TextIcon /></button>

            <!-- Color Picker -->
            <input
                type="color"
                :value="selectedColor"
                class="size-5 rounded-full border-2 border-black"
                :style="{ backgroundColor: selectedColor }"
                @input="selectedColor = $event.target.value" />
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
