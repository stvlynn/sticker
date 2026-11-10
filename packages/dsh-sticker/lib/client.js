/**
 * Browser half of the Lynn sticker DeepSeek Harness bundle.
 *
 * Registers one keyed tool view for the `send_sticker` tool. The host persists
 * only a tiny `meta` payload on `tool/result`; this view turns that payload into
 * an inline sticker. Media is loaded on demand from sticker.stv.pm; the plugin
 * package bundles no sticker images or loops.
 */
window.__ModuleLoader__.load({
  id: 'dsh-lynn-sticker',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const CSS = `
      .dsh-lynn-sticker { display: flex; align-items: flex-start; padding: 2px 0 4px; }
      .dsh-lynn-sticker__media {
        display: block;
        width: 168px;
        height: 168px;
        max-width: min(168px, 42vw);
        max-height: min(168px, 42vw);
        object-fit: contain;
        border-radius: 10px;
        filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.16));
        user-select: none;
        pointer-events: none;
      }
      .dsh-lynn-sticker__media:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 3px; }
    `

    function useReducedMotion() {
      const [reduced, setReduced] = React.useState(false)
      React.useEffect(() => {
        if (typeof window.matchMedia !== 'function') return undefined
        const query = window.matchMedia('(prefers-reduced-motion: reduce)')
        const update = () => setReduced(query.matches)
        update()
        if (typeof query.addEventListener === 'function') {
          query.addEventListener('change', update)
          return () => query.removeEventListener('change', update)
        }
        query.addListener(update)
        return () => query.removeListener(update)
      }, [])
      return reduced
    }

    function StickerMedia({ meta }) {
      const reduced = useReducedMotion()
      const [videoFailed, setVideoFailed] = React.useState(false)
      const thumb = meta.thumb
      const title = typeof meta.title === 'string' && meta.title !== '' ? meta.title : 'Lynn sticker'
      const useVideo = typeof meta.video === 'string' && meta.video !== '' && !reduced && !videoFailed
      if (useVideo) {
        return h(
          'div',
          { className: 'dsh-lynn-sticker' },
          h('video', {
            className: 'dsh-lynn-sticker__media',
            src: meta.video,
            poster: thumb,
            autoPlay: true,
            loop: true,
            muted: true,
            playsInline: true,
            preload: 'metadata',
            'aria-label': title,
            onError: () => setVideoFailed(true),
          }),
        )
      }
      return h(
        'div',
        { className: 'dsh-lynn-sticker' },
        h('img', {
          className: 'dsh-lynn-sticker__media',
          src: thumb,
          alt: title,
          title,
          draggable: false,
          loading: 'lazy',
          decoding: 'async',
        }),
      )
    }

    function StickerView(props) {
      if (props.phase !== 'result') return null
      const block = props.block
      if (!block || block.isError === true) return null
      const meta = block.meta
      if (!meta || meta.sent !== true || typeof meta.thumb !== 'string') return null
      return h(StickerMedia, { meta })
    }

    /** Find the last successful `send_sticker` result in one completed Turn. */
    function selectStickerForTurn(snapshot, turn) {
      const turnNumber = turn !== null && typeof turn === 'object' ? turn.turn : turn
      const keys = snapshot?.locations?.getTurn?.(turnNumber)
      if (keys === undefined || keys === null) return null
      for (let index = keys.length - 1; index >= 0; index--) {
        const node = snapshot.nodes?.get?.(keys[index])
        if (!node || node.kind !== 'tool-call') continue
        const root = node.data?.root
        if (!root || root.kind !== 'tool-result') continue
        const name = root.call?.name ?? root.name
        if (name !== 'send_sticker') continue
        const meta = root.meta
        if (meta && meta.sent === true && typeof meta.thumb === 'string') return meta
      }
      return null
    }

    /**
     * Render the sticker at the completed Turn tail, outside the collapsible
     * tool-call group, so it is visible in normal conversation flow.
     */
    function StickerTail(props) {
      const meta = props.useChat(snapshot => selectStickerForTurn(snapshot, props.turn))
      if (!meta) return null
      return h(StickerMedia, { meta })
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.effect(() => {
          const style = document.createElement('style')
          style.dataset.dshLynnSticker = '1'
          style.textContent = CSS
          document.head.append(style)
          return () => style.remove()
        }, 'lynn-sticker: styles')
        ctx.slots.inject('tool.call.toolview', () =>
          ctx.slots.register(
            {
              name: 'tool.call.toolview',
              key: 'send_sticker',
            },
            StickerView,
          ),
        )
        ctx.slots.inject('conversation.chat.turnTail', () =>
          ctx.slots.register(
            {
              name: 'conversation.chat.turnTail',
              id: 'lynn-sticker-turn-tail',
              order: 10,
            },
            StickerTail,
          ),
        )
      },
    }
  },
})
