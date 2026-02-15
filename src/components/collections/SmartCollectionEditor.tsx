import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { SmartRule } from '../../lib/tauri';

interface SmartCollectionEditorProps {
  rules: SmartRule[];
  onChange: (rules: SmartRule[]) => void;
}

type RuleField = 'author' | 'tag' | 'format' | 'series' | 'rating' | 'added_date' | 'title' | 'publisher' | 'language';
type RuleOperator = 'equals' | 'contains' | 'greater_than' | 'less_than' | 'in_last_days' | 'not_equals' | 'starts_with' | 'ends_with' | 'is_empty' | 'is_not_empty';
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
  added_date: [
    { value: 'in_last_days', label: 'in last N days' },
  ],
};

const FORMAT_OPTIONS = ['epub', 'pdf', 'mobi', 'azw3', 'txt', 'html'];

export const SmartCollectionEditor = ({ rules, onChange }: SmartCollectionEditorProps) => {
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

    // Don't show value input for operators that don't need it
    if (['is_empty', 'is_not_empty'].includes(operator)) {
      return (
        <div className="flex-1 px-3 py-2 text-sm text-gray-500 dark:text-gray-400 italic">
          No value needed
        </div>
      );
    }

    switch (field) {
      case 'format':
        return (
          <select
            value={rule.value}
            onChange={(e) => updateRule(index, { value: e.target.value })}
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">Select format...</option>
            {FORMAT_OPTIONS.map((fmt) => (
              <option key={fmt} value={fmt}>
                {fmt.toUpperCase()}
              </option>
            ))}
          </select>
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
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
          />
        );

      case 'language':
        return (
          <input
            type="text"
            value={rule.value}
            onChange={(e) => updateRule(index, { value: e.target.value })}
            placeholder="e.g., en, es, fr"
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
          />
        );

      case 'added_date':
        return (
          <input
            type="number"
            min="1"
            value={rule.value}
            onChange={(e) => updateRule(index, { value: e.target.value })}
            placeholder="Number of days"
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
          />
        );

      default:
        return (
          <input
            type="text"
            value={rule.value}
            onChange={(e) => updateRule(index, { value: e.target.value })}
            placeholder="Enter value..."
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
          />
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Match Type Selector */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-600 dark:text-gray-400">Match</span>
        <select
          value={matchType}
          onChange={(e) => handleMatchTypeChange(e.target.value as MatchType)}
          className="px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
        >
          <option value="all">ALL</option>
          <option value="any">ANY</option>
        </select>
        <span className="text-gray-600 dark:text-gray-400">of the following rules:</span>
      </div>

      {/* Rules List */}
      <div className="space-y-3">
        {rules.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              No rules added yet
            </p>
            <button
              type="button"
              onClick={addRule}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Add your first rule
            </button>
          </div>
        ) : (
          rules.map((rule, index) => {
            const field = rule.field as RuleField;
            const operators = OPERATOR_MAP[field];

            return (
              <div key={index} className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                {/* Field Selector */}
                <select
                  value={rule.field}
                  onChange={(e) => updateRule(index, { field: e.target.value as RuleField })}
                  className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {FIELD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                {/* Operator Selector */}
                <select
                  value={rule.operator}
                  onChange={(e) => updateRule(index, { operator: e.target.value as RuleOperator })}
                  className="w-40 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {operators.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                {/* Value Input */}
                {renderValueInput(rule, index)}

                {/* Remove Button */}
                <button
                  type="button"
                  onClick={() => removeRule(index)}
                  className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg transition-colors"
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
      {rules.length > 0 && (
        <button
          type="button"
          onClick={addRule}
          className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Rule
        </button>
      )}

      {/* Preview Info */}
      {rules.length > 0 && (
        <div className="text-xs text-gray-500 dark:text-gray-400 italic">
          Books will be automatically added to this collection when they match {matchType === 'all' ? 'all' : 'any'} of the rules above.
        </div>
      )}
    </div>
  );
};
