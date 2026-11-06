import { useEffect, useRef } from 'react';
import { toHtml, sanitizeHtml, isHtml } from '../lib/richtext.js';

// Toolbar actions use the browser's built-in editing commands (bold, lists, indent) on a contenteditable area.
const TOOLS = [
  [['bold', 'B', 'Bold (Ctrl+B)', { fontWeight: 800 }], ['italic', 'I', 'Italic (Ctrl+I)', { fontStyle: 'italic' }], ['underline', 'U', 'Underline (Ctrl+U)', { textDecoration: 'underline' }]],
  [['h4', 'H', 'Heading'], ['p', '¶', 'Normal text']],
  [['insertUnorderedList', '•', 'Bulleted list'], ['insertOrderedList', '1.', 'Numbered list'], ['outdent', '⇤', 'Decrease indent (Shift+Tab)'], ['indent', '⇥', 'Increase indent (Tab)']],
  [['removeFormat', '⌫', 'Clear formatting']]
];

/** Small rich-text editor that keeps bold, headings and nested lists. Emits sanitized HTML. */
export default function RichText({ id, label, value, onChange, placeholder, labelClass }) {
  const ref = useRef(null);
  const last = useRef(null); // last HTML we emitted, so typing doesn't reset the cursor

  useEffect(() => {
    const el = ref.current;
    if (!el || value === last.current) return;
    el.innerHTML = toHtml(value);
    last.current = value;
  }, [value]);

  const emit = () => {
    const el = ref.current;
    const html = el.textContent.trim() ? sanitizeHtml(el.innerHTML) : '';
    last.current = html;
    onChange(html);
  };
  const run = (cmd) => {
    ref.current.focus();
    if (cmd === 'h4' || cmd === 'p') document.execCommand('formatBlock', false, cmd);
    else if (cmd === 'removeFormat') { document.execCommand('removeFormat'); document.execCommand('formatBlock', false, 'p'); }
    else document.execCommand(cmd);
    emit();
  };
  const onKeyDown = (e) => {
    if (e.key === 'Tab' && (document.queryCommandState('insertUnorderedList') || document.queryCommandState('insertOrderedList'))) {
      e.preventDefault(); document.execCommand(e.shiftKey ? 'outdent' : 'indent'); emit();
    }
  };
  // Paste from Word or the web keeps bold / headings / lists but drops fonts, colours and other markup
  const onPaste = (e) => {
    const html = e.clipboardData.getData('text/html');
    if (!html || !isHtml(html)) return;
    e.preventDefault();
    document.execCommand('insertHTML', false, sanitizeHtml(html.replace(/^[\s\S]*<body[^>]*>|<\/body>[\s\S]*$/gi, '')));
    emit();
  };

  return (
    <div className="fg rt-field">
      <label id={id + '-label'} htmlFor={id} className={labelClass}>{label}</label>
      <div className="rt">
        <div className="rt-bar" role="toolbar" aria-label={label + ' formatting'}>
          {TOOLS.map((group, g) => (
            <span key={g} className="rt-group">
              {group.map(([cmd, glyph, title, style]) => (
                <button key={cmd} type="button" title={title} aria-label={title} style={style} onMouseDown={(e) => { e.preventDefault(); run(cmd); }}>{glyph}</button>
              ))}
            </span>
          ))}
        </div>
        <div ref={ref} id={id} className="rt-area rt-content" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true"
          aria-labelledby={id + '-label'} data-placeholder={placeholder} onInput={emit} onKeyDown={onKeyDown} onPaste={onPaste} />
      </div>
    </div>
  );
}

/** Read-only rendering of a rich (or older plain-text) value. */
export function RichView({ value, className = '' }) {
  return <div className={`rt-content ${className}`} dangerouslySetInnerHTML={{ __html: toHtml(value) }} />;
}
