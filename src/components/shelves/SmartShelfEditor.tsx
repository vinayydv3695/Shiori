import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SmartRule } from '../../lib/tauri';

interface SmartShelfEditorProps {
  rules: SmartRule[];
  onChange: (rules: SmartRule[]) => void;
}

type RuleField = 'author' | 'tag' | 'format' | 'series' | 'rating' | 'added_date' | 'title' | 'publisher' | 'language' | 'reading_status' | 'is_favorite';
type RuleOperator = 'equals' | 'contains' | 'greater_than' | 'less_than' | 'in_last_days' | 'not_equals' | 'starts_with' | 'ends_with' | 'is_empty' | 'is_not_empty' | 'is_one_of';
type MatchType = 'all' | 'any';

const FIELD_OPTIONS: { value: RuleField; label: string }[] = [
  { value: 'title', label: 'Title' },
  { value: 'author', label: 'Author' },
  { value: 'tag', label: 'Tag' },
  { value: 'format', label: 'Format' },
  { value: 'series', label: 'Series' },
  { value: 'rating', label: 'Rating' },
  { value: 'publisher', label: 'Publisher' },
  { value: 'language', label: 'Language' },
  { value: 'reading_status', label: 'Reading Status' },
  { value: 'is_favorite', label: 'Favorite' },
  { value: 'added_date', label: 'Date Added' },
];

const OPERATOR_MAP: Record<RuleField, { value: RuleOperator; label: string }[]> = {
  title: [
    { value: 'contains', label: 'contains' },
    { value: 'equals', label: 'is exactly' },
    { value: 'not_equals', label: 'is not' },
    { value: 'starts_with', label: 'starts with' },
    { value: 'ends_with', label: 'ends with' },
  ],
  author: [
    { value: 'contains', label: 'contains' },
    { value: 'equals', label: 'is exactly' },
    { value: 'not_equals', label: 'is not' },
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
  tag: [
    { value: 'contains', label: 'has tag' },
    { value: 'is_empty', label: 'has no tags' },
  ],
  format: [
    { value: 'equals', label: 'is' },
    { value: 'not_equals', label: 'is not' },
  ],
  series: [
    { value: 'equals', label: 'is' },
    { value: 'contains', label: 'contains' },
    { value: 'is_empty', label: 'is not in a series' },
    { value: 'is_not_empty', label: 'is in a series' },
  ],
  rating: [
    { value: 'equals', label: 'is' },
    { value: 'greater_than', label: 'is greater than' },
    { value: 'less_than', label: 'is less than' },
    { value: 'is_empty', label: 'is unrated' },
  ],
  publisher: [
    { value: 'contains', label: 'contains' },
    { value: 'equals', label: 'is exactly' },
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
  language: [
    { value: 'equals', label: 'is' },
    { value: 'not_equals', label: 'is not' },
    { value: 'is_empty', label: 'is not set' },
  ],
  reading_status: [
    { value: 'equals', label: 'is' },
    { value: 'not_equals', label: 'is not' },
    { value: 'is_one_of', label: 'is one of' },
  ],
  is_favorite: [
    { value: 'equals', label: 'is' },
  ],
  added_date: [
    { value: 'in_last_days', label: 'in last N days' },
  ],
};

const FORMAT_OPTIONS = ['epub', 'pdf', 'mobi', 'azw3', 'txt', 'html'];
const READING_STATUS_OPTIONS = [
  { value: 'planning', label: 'Planning to Read' },
  { value: 'reading', label: 'Currently Reading' },
  { value: 'completed', label: 'Completed' },
  { value: 'paused', label: 'On Hold' },
  { value: 'dropped', label: 'Dropped' },
];

export const SmartShelfEditor = ({ rules, onChange }: SmartShelfEditorProps) => {
  const [matchType, setMatchType] = useState<MatchType>('all');

  const addRule = () => {
    const newRule: SmartRule = {
      field: 'author',
      operator: 'contains',
      value: '',
      matchType: matchType,
    };
    onChange([...rules, newRule]);
  };

  const removeRule = (index: number) => {
    const newRules = rules.filter((_, i) => i !== index);
    onChange(newRules);
  };

  const updateRule = (index: number, updates: Partial<SmartRule>) => {
    const newRules = rules.map((rule, i) => {
      if (i === index) {
        const updatedRule = { ...rule, ...updates };
        
        // Reset operator if field changed
        if (updates.field && updates.field !== rule.field) {
          const newField = updates.field as RuleField;
          updatedRule.operator = OPERATOR_MAP[newField][0].value;
          updatedRule.value = '';
        }
        
        return updatedRule;
      }
      return rule;
    });
    onChange(newRules);
  };

  const handleMatchTypeChange = (newMatchType: MatchType) => {
    setMatchType(newMatchType);
    // Update all rules with new match type
    const newRules = rules.map(rule => ({ ...rule, matchType: newMatchType }));
    onChange(newRules);
  };

  const renderValueInput = (rule: SmartRule, index: number) => {
    const field = rule.field as RuleField;
    const operator = rule.operator as RuleOperator;
    
    const inputClasses = "flex-1 px-4 py-2 border border-white/10 rounded-xl bg-white/5 text-sm text-white/90 placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-white/20 hover:border-white/20 transition-all";
    const selectClasses = "flex-1 appearance-none px-4 py-2 border border-white/10 rounded-xl bg-white/5 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-white/20 hover:border-white/20 transition-all";

    // Don't show value input for operators that don't need it
    if (['is_empty', 'is_not_empty'].includes(operator)) {
      return (
        <div className="flex-1 px-4 py-2 text-sm text-white/40 italic">
          No value needed
        </div>
      );
    }

    switch (field) {
      case 'format':
        return (
          <Select
            value={rule.value || ''}
            onValueChange={(val) => updateRule(index, { value: val })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select format..." />
            </SelectTrigger>
            <SelectContent>
              {FORMAT_OPTIONS.map((fmt) => (
                <SelectItem key={fmt} value={fmt}>
                  {fmt.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'reading_status':
        if (operator === 'is_one_of') {
          // Multi-select for reading status
          const selectedStatuses = rule.value ? rule.value.split(',') : [];
          return (
            <div className="flex-1 flex flex-wrap gap-3 px-4 py-3 border border-white/10 rounded-xl bg-white/5">
              {READING_STATUS_OPTIONS.map((status) => (
                <label key={status.value} className="flex items-center gap-2 text-sm cursor-pointer text-white/80 hover:text-white transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedStatuses.includes(status.value)}
                    onChange={(e) => {
                      const newStatuses = e.target.checked
                        ? [...selectedStatuses, status.value]
                        : selectedStatuses.filter(s => s !== status.value);
                      updateRule(index, { value: newStatuses.join(',') });
                    }}
                    className="rounded border-white/20 bg-white/10 text-white focus:ring-0 focus:ring-offset-0"
                  />
                  <span>{status.label}</span>
                </label>
              ))}
            </div>
          );
        } else {
          return (
            <Select
              value={rule.value || ''}
              onValueChange={(val) => updateRule(index, { value: val })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select status..." />
              </SelectTrigger>
              <SelectContent>
                {READING_STATUS_OPTIONS.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        }

      case 'is_favorite':
        return (
          <Select
            value={rule.value || ''}
            onValueChange={(val) => updateRule(index, { value: val })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select favorite..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Yes (Favorite)</SelectItem>
              <SelectItem value="false">No (Not Favorite)</SelectItem>
            </SelectContent>
          </Select>
        );

      case 'rating':
        return (
          <input
            type="number"
            min="0"
            max="5"
            step="0.5"
            value={rule.value}
            onChange={(e) => updateRule(index, { value: e.target.value })}
            placeholder="0-5"
            className={inputClasses}
          />
        );

      case 'added_date':
        if (operator === 'in_last_days') {
          return (
            <div className="flex-1 flex items-center gap-2">
              <input
                type="number"
                min="1"
                value={rule.value}
                onChange={(e) => updateRule(index, { value: e.target.value })}
                placeholder="Days"
                className={inputClasses}
              />
              <span className="text-sm text-white/50">days</span>
            </div>
          );
        }
        return (
          <input
            type="date"
            value={rule.value}
            onChange={(e) => updateRule(index, { value: e.target.value })}
            className={inputClasses}
          />
        );

      default:
        return (
          <input
            type="text"
            value={rule.value}
            onChange={(e) => updateRule(index, { value: e.target.value })}
            placeholder="Enter value..."
            className={inputClasses}
          />
        );
    }
  };

  return (
    <div className="space-y-6 p-4">
      {/* Match Type Selector */}
      <div className="flex items-center gap-3 text-sm text-white/70">
        <span>Match</span>
        <Select
          value={matchType}
          onValueChange={(val) => handleMatchTypeChange(val as MatchType)}
        >
          <SelectTrigger className="w-24 h-8 bg-white/5 border-white/10 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ALL</SelectItem>
            <SelectItem value="any">ANY</SelectItem>
          </SelectContent>
        </Select>
        <span>of the following rules:</span>
      </div>

      {/* Rules List */}
      <div className="space-y-3">
        {rules.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-white/10 rounded-2xl bg-white/5">
            <p className="text-sm text-white/50 mb-3">
              No rules added yet
            </p>
            <button
              type="button"
              onClick={addRule}
              className="text-sm text-white/70 hover:text-white border-b border-white/30 hover:border-white transition-colors"
            >
              Add your first rule
            </button>
          </div>
        ) : (
          rules.map((rule, index) => {
            const field = rule.field as RuleField;
            const operators = OPERATOR_MAP[field];

            return (
              <div key={index} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-white/5 border border-white/5 rounded-2xl relative">
                {/* Field Selector */}
                <div className="w-full sm:w-36">
                  <Select
                    value={rule.field}
                    onValueChange={(val) => updateRule(index, { field: val as RuleField })}
                  >
                    <SelectTrigger className="w-full bg-white/5 border-white/10 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Operator Selector */}
                <div className="w-full sm:w-44">
                  <Select
                    value={rule.operator}
                    onValueChange={(val) => updateRule(index, { operator: val as RuleOperator })}
                  >
                    <SelectTrigger className="w-full bg-white/5 border-white/10 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {operators.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Value Input */}
                <div className="flex-1 w-full flex">
                  {renderValueInput(rule, index)}
                </div>

                {/* Delete Button */}
                <button
                  type="button"
                  onClick={() => removeRule(index)}
                  className="p-2 text-white/40 hover:text-red-400 hover:bg-white/5 rounded-lg transition-colors self-end sm:self-center"
                  title="Remove rule"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Add Rule Button */}
      <button
        type="button"
        onClick={addRule}
        className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white/80 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all w-full justify-center"
      >
        <Plus className="w-4 h-4" />
        Add Condition
      </button>

      {/* Preview Info */}
      {rules.length > 0 && (
        <div className="text-xs text-white/40 italic mt-2 pl-1">
          Books will be automatically added to this shelf when they match {matchType === 'all' ? 'all' : 'any'} of the rules above.
        </div>
      )}
    </div>
  );
};
