/**
 * MultiSelect — Ink component for Space-to-toggle, Enter-to-confirm multi-selection
 */

import React, { useState } from 'react';
import { Box, Text, useInput, type Key } from 'ink';

export interface MultiSelectItem {
  label: string;
  value: string;
  hint?: string;
  disabled?: boolean;
}

export interface MultiSelectProps {
  label: string;
  items: MultiSelectItem[];
  defaultSelected?: string[];
  onSubmit: (selected: string[]) => void;
}

export function MultiSelect({ label, items, defaultSelected = [], onSubmit }: MultiSelectProps) {
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set(defaultSelected));

  useInput((input: string, key: Key) => {
    if (key.upArrow) { setCursor(c => Math.max(0, c - 1)); }
    if (key.downArrow) { setCursor(c => Math.min(items.length - 1, c + 1)); }
    if (input === ' ') {
      const item = items[cursor];
      if (item && !item.disabled) {
        setSelected(prev => {
          const next = new Set(prev);
          if (next.has(item.value)) { next.delete(item.value); } else { next.add(item.value); }
          return next;
        });
      }
    }
    if (key.return) {
      setSelected(prev => { onSubmit([...prev]); return prev; });
    }
  });

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>{label}</Text>
      <Text dimColor>  (↑↓ navigate · Space toggle · Enter confirm)</Text>
      {items.map((item, i) => (
        <Box key={item.value}>
          <Text color={i === cursor ? 'cyan' : undefined}>
            {`  ${selected.has(item.value) ? '◉' : '◯'} ${item.label}`}
            {item.hint ? <Text dimColor>{`  ${item.hint}`}</Text> : null}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
