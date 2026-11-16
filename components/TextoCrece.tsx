"use client";

import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";

/**
 * Un campo de una línea que crece hacia abajo cuando el texto no cabe (en vez de esconderlo a los lados).
 * Enter no hace salto de línea: llama a `onEnter` si se indica y, si no, envía su formulario.
 * Al no ser un <input>, el teclado del móvil no le pone encima el menú de contraseñas, tarjetas y direcciones.
 */
const TextoCrece = forwardRef<HTMLTextAreaElement, Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & { value: string; onTexto: (v: string) => void; onEnter?: () => void }>(
  function TextoCrece({ value, onTexto, onEnter, onKeyDown, className, ...resto }, ref) {
    const el = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => el.current as HTMLTextAreaElement);
    useLayoutEffect(() => {
      const e = el.current;
      if (!e) return;
      e.style.height = "auto";
      e.style.height = `${e.scrollHeight}px`;
    }, [value]);
    return (
      <textarea
        ref={el}
        rows={1}
        className={`crece${className ? ` ${className}` : ""}`}
        value={value}
        onChange={(e) => onTexto(e.target.value.replace(/\s*\n+\s*/g, " "))}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (e.key === "Enter" && !e.defaultPrevented && !e.nativeEvent.isComposing) {
            e.preventDefault();
            /* Sin onEnter, Intro hace lo que hacía un campo de una línea: enviar su formulario */
            if (onEnter) onEnter();
            else e.currentTarget.form?.requestSubmit();
          }
        }}
        {...resto}
      />
    );
  },
);
export default TextoCrece;
