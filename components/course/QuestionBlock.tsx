'use client';

import { useState } from 'react';
import { Database } from '@/types/database.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CheckCircle, XCircle, RotateCcw, Send, Lightbulb } from 'lucide-react';

type Question = Database['public']['Tables']['questions']['Row'];

interface QuestionBlockProps {
  question: Question;
  onAnswer: (questionId: string, selectedOptions: any[], isCorrect: boolean) => void;
  disabled?: boolean;
}

export function QuestionBlock({ question, onAnswer, disabled = false }: QuestionBlockProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  const options = Array.isArray(question.options) ? question.options : [];

  const correctAnswers = Array.isArray(question.correct_answer)
    ? question.correct_answer.map((a: any) => {
        const val = String(a).trim();
        if (/^\d+$/.test(val)) {
          const idx = parseInt(val, 10);
          return options[idx] ? String(options[idx]).trim() : val;
        }
        return val;
      })
    : question.correct_answer
      ? [String(question.correct_answer).trim()]
      : [];

  const handleSubmit = () => {
    if (!selectedOption) return;

    const correct = correctAnswers.includes(selectedOption);
    setIsCorrect(correct);
    setSubmitted(true);
    onAnswer(question.id, [selectedOption], correct);
  };

  const handleReset = () => {
    setSelectedOption(null);
    setSubmitted(false);
    setIsCorrect(null);
  };

  const getOptionStyle = (optionValue: string) => {
    if (!submitted) {
      if (selectedOption === optionValue) {
        return 'border-sky-500 bg-sky-50 ring-2 ring-sky-200';
      }
      return 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 cursor-pointer';
    }

    const isThisCorrect = correctAnswers.includes(optionValue);
    const isSelected = selectedOption === optionValue;

    if (isThisCorrect) {
      return 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200';
    }
    if (isSelected && !isThisCorrect) {
      return 'border-red-400 bg-red-50 ring-2 ring-red-200';
    }
    return 'border-slate-200 bg-slate-50 opacity-60';
  };

  const getOptionIcon = (optionValue: string) => {
    if (!submitted) return null;

    const isThisCorrect = correctAnswers.includes(optionValue);
    const isSelected = selectedOption === optionValue;

    if (isThisCorrect) {
      return <CheckCircle className="h-5 w-5 text-emerald-600 flex-shrink-0" />;
    }
    if (isSelected && !isThisCorrect) {
      return <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />;
    }
    return null;
  };

  const letters = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח'];

  return (
    <Card className={`transition-all duration-300 ${
      submitted
        ? isCorrect
          ? 'border-emerald-400 shadow-emerald-100 shadow-md'
          : 'border-red-300 shadow-red-100 shadow-md'
        : 'border-slate-200 hover:shadow-md'
    }`}>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
            submitted
              ? isCorrect
                ? 'bg-emerald-100'
                : 'bg-red-100'
              : 'bg-sky-100'
          }`}>
            <Lightbulb className={`h-4 w-4 ${
              submitted
                ? isCorrect
                  ? 'text-emerald-600'
                  : 'text-red-500'
                : 'text-sky-600'
            }`} />
          </div>
          <CardTitle className="text-base font-semibold text-slate-900 leading-relaxed">
            {question.prompt}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="space-y-2">
          {options.map((option: any, index: number) => {
            const rawValue = typeof option === 'string' ? option : (option.value || String(option));
            const optValue = rawValue.trim();
            const optLabel = typeof option === 'string' ? option : (option.label || String(option));

            return (
              <button
                key={index}
                onClick={() => !submitted && !disabled && setSelectedOption(optValue)}
                disabled={submitted || disabled}
                className={`w-full text-right flex items-center gap-3 p-3 rounded-lg border-2 transition-all duration-200 ${getOptionStyle(optValue)}`}
              >
                <span className={`flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-sm font-bold ${
                  submitted && correctAnswers.includes(optValue)
                    ? 'bg-emerald-200 text-emerald-800'
                    : submitted && selectedOption === optValue
                      ? 'bg-red-200 text-red-800'
                      : selectedOption === optValue
                        ? 'bg-sky-200 text-sky-800'
                        : 'bg-slate-100 text-slate-500'
                }`}>
                  {letters[index] || index + 1}
                </span>
                <Label className="flex-1 text-sm leading-relaxed cursor-pointer text-right">
                  {optLabel}
                </Label>
                {getOptionIcon(optValue)}
              </button>
            );
          })}
        </div>

        {submitted && (
          <div className={`flex items-center gap-2 p-3 rounded-lg text-sm font-medium ${
            isCorrect
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {isCorrect ? (
              <>
                <CheckCircle className="h-4 w-4 flex-shrink-0" />
                <span>תשובה נכונה!</span>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 flex-shrink-0" />
                <span>לא נכון. התשובה הנכונה מסומנת בירוק.</span>
              </>
            )}
          </div>
        )}

        <div className="flex justify-end pt-1">
          {!submitted ? (
            <Button
              onClick={handleSubmit}
              disabled={!selectedOption || disabled}
              size="sm"
              className="bg-sky-600 hover:bg-sky-700"
            >
              <Send className="h-3.5 w-3.5 ml-2" />
              בדוק תשובה
            </Button>
          ) : (
            <Button onClick={handleReset} variant="outline" size="sm">
              <RotateCcw className="h-3.5 w-3.5 ml-2" />
              נסה שוב
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
