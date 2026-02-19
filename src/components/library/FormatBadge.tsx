import React from 'react';
import { FileText, FileImage, File } from 'lucide-react';

interface FormatBadgeProps {
  format: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

const FormatBadge: React.FC<FormatBadgeProps> = ({ 
  format, 
  size = 'md', 
  showIcon = true,
  className = '' 
}) => {
  const normalizedFormat = format.toUpperCase();

  // Get format-specific styling
  const getFormatStyle = (fmt: string) => {
    switch (fmt) {
      case 'EPUB':
        return {
          bg: 'bg-blue-100 dark:bg-blue-900/30',
          text: 'text-blue-700 dark:text-blue-300',
          border: 'border-blue-200 dark:border-blue-800',
          icon: <FileText className="w-3 h-3" />,
        };
      case 'PDF':
        return {
          bg: 'bg-red-100 dark:bg-red-900/30',
          text: 'text-red-700 dark:text-red-300',
          border: 'border-red-200 dark:border-red-800',
          icon: <FileText className="w-3 h-3" />,
        };
      case 'MOBI':
      case 'AZW3':
        return {
          bg: 'bg-orange-100 dark:bg-orange-900/30',
          text: 'text-orange-700 dark:text-orange-300',
          border: 'border-orange-200 dark:border-orange-800',
          icon: <FileText className="w-3 h-3" />,
        };
      case 'DOCX':
      case 'DOC':
        return {
          bg: 'bg-indigo-100 dark:bg-indigo-900/30',
          text: 'text-indigo-700 dark:text-indigo-300',
          border: 'border-indigo-200 dark:border-indigo-800',
          icon: <FileText className="w-3 h-3" />,
        };
      case 'HTML':
      case 'HTM':
        return {
          bg: 'bg-purple-100 dark:bg-purple-900/30',
          text: 'text-purple-700 dark:text-purple-300',
          border: 'border-purple-200 dark:border-purple-800',
          icon: <FileText className="w-3 h-3" />,
        };
      case 'FB2':
        return {
          bg: 'bg-teal-100 dark:bg-teal-900/30',
          text: 'text-teal-700 dark:text-teal-300',
          border: 'border-teal-200 dark:border-teal-800',
          icon: <FileText className="w-3 h-3" />,
        };
      case 'TXT':
        return {
          bg: 'bg-gray-100 dark:bg-gray-700',
          text: 'text-gray-700 dark:text-gray-300',
          border: 'border-gray-200 dark:border-gray-600',
          icon: <FileText className="w-3 h-3" />,
        };
      case 'CBZ':
      case 'CBR':
        return {
          bg: 'bg-pink-100 dark:bg-pink-900/30',
          text: 'text-pink-700 dark:text-pink-300',
          border: 'border-pink-200 dark:border-pink-800',
          icon: <FileImage className="w-3 h-3" />,
        };
      default:
        return {
          bg: 'bg-gray-100 dark:bg-gray-700',
          text: 'text-gray-700 dark:text-gray-300',
          border: 'border-gray-200 dark:border-gray-600',
          icon: <File className="w-3 h-3" />,
        };
    }
  };

  // Get size-specific classes
  const getSizeClasses = (sz: string) => {
    switch (sz) {
      case 'sm':
        return 'px-1.5 py-0.5 text-xs';
      case 'md':
        return 'px-2 py-1 text-xs';
      case 'lg':
        return 'px-3 py-1.5 text-sm';
      default:
        return 'px-2 py-1 text-xs';
    }
  };

  const style = getFormatStyle(normalizedFormat);
  const sizeClasses = getSizeClasses(size);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium border ${style.bg} ${style.text} ${style.border} ${sizeClasses} ${className}`}
      title={`${normalizedFormat} format`}
    >
      {showIcon && <span className={style.text}>{style.icon}</span>}
      <span>{normalizedFormat}</span>
    </span>
  );
};

export default FormatBadge;
