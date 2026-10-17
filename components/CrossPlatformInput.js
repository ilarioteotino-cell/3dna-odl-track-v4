import React from 'react';
import { Platform, TextInput } from 'react-native';

export default function CrossPlatformInput(props) {
  if (Platform.OS === 'web') {
    const { style, value, onChangeText, placeholder, multiline, numberOfLines, keyboardType, ...otherProps } = props;
    
    const webStyle = {
      flex: style?.flex,
      backgroundColor: style?.backgroundColor || '#fff',
      padding: style?.padding ? `${style.padding}px` : '15px',
      borderRadius: style?.borderRadius ? `${style.borderRadius}px` : '10px',
      fontSize: style?.fontSize ? `${style.fontSize}px` : '16px',
      borderWidth: style?.borderWidth ? `${style.borderWidth}px` : '1px',
      borderStyle: 'solid',
      borderColor: style?.borderColor || '#ddd',
      outline: 'none',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      width: '100%',
      boxSizing: 'border-box',
      height: style?.height ? `${style.height}px` : 'auto',
      resize: multiline ? 'vertical' : 'none'
    };

    if (multiline) {
      return (
        <textarea
          style={webStyle}
          value={value}
          onChange={(e) => onChangeText && onChangeText(e.target.value)}
          placeholder={placeholder}
          rows={numberOfLines || 3}
          {...otherProps}
        />
      );
    }

    return (
      <input
        style={webStyle}
        type={keyboardType === 'numeric' ? 'number' : 'text'}
        value={value}
        onChange={(e) => onChangeText && onChangeText(e.target.value)}
        placeholder={placeholder}
        {...otherProps}
      />
    );
  }

  return <TextInput {...props} />;
}
