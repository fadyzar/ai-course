'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/database.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, Check, X, Edit2, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type Question = Database['public']['Tables']['questions']['Row'];

interface QuestionEditorProps {
  question: Question;
  onUpdate: () => void;
  onDelete: (id: string) => void;
}

export function QuestionEditor({ question, onUpdate, onDelete }: QuestionEditorProps) {
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState(question.prompt);
  const [type, setType] = useState(question.type);
  const [options, setOptions] = useState<string[]>(
    Array.isArray(question.options) ? question.options : []
  );
  const [correctAnswer, setCorrectAnswer] = useState<string[]>(
    Array.isArray(question.correct_answer)
      ? question.correct_answer
      : question.correct_answer
      ? [question.correct_answer]
      : []
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!prompt.trim() || options.length === 0 || correctAnswer.length === 0) {
      toast.error('נא למלא את כל השדות');
      return;
    }

    setSaving(true);
    try {
      const { error } = await (supabase
        .from('questions') as any)
        .update({
          prompt,
          type,
          options,
          correct_answer: correctAnswer,
          reviewed_by_teacher: true,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', question.id);

      if (error) throw error;

      toast.success('השאלה עודכנה בהצלחה');
      setEditing(false);
      onUpdate();
    } catch (error: any) {
      toast.error('שגיאה בעדכון השאלה: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddOption = () => {
    setOptions([...options, '']);
  };

  const handleRemoveOption = (index: number) => {
    const newOptions = options.filter((_, i) => i !== index);
    setOptions(newOptions);
    setCorrectAnswer(correctAnswer.filter((ans) => ans !== options[index]));
  };

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...options];
    const oldValue = newOptions[index];
    newOptions[index] = value;
    setOptions(newOptions);

    if (correctAnswer.includes(oldValue)) {
      setCorrectAnswer(correctAnswer.map((ans) => (ans === oldValue ? value : ans)));
    }
  };

  const handleCorrectAnswerToggle = (value: string, checked: boolean) => {
    if (type === 'single_choice') {
      setCorrectAnswer([value]);
    } else {
      if (checked) {
        setCorrectAnswer([...correctAnswer, value]);
      } else {
        setCorrectAnswer(correctAnswer.filter((ans) => ans !== value));
      }
    }
  };

  if (!editing) {
    return (
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div className="space-y-2 flex-1">
              <CardTitle className="text-lg">{question.prompt}</CardTitle>
              <div className="flex items-center space-x-2 space-x-reverse">
                {question.reviewed_by_teacher ? (
                  <Badge className="bg-green-100 text-green-700">
                    <Check className="h-3 w-3 ml-1" />
                    אושר
                  </Badge>
                ) : (
                  <Badge className="bg-yellow-100 text-yellow-700">
                    <AlertCircle className="h-3 w-3 ml-1" />
                    ממתין לאישור
                  </Badge>
                )}
                {question.confidence !== undefined && question.confidence < 0.7 && (
                  <Badge variant="outline">ביטחון נמוך</Badge>
                )}
              </div>
            </div>
            <div className="flex space-x-2 space-x-reverse">
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Edit2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(question.id)}
                className="text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {options.map((option: any, index: number) => {
            const optValue = option.value || option;
            const optLabel = option.label || option;
            const isCorrect = correctAnswer.includes(optValue);

            return (
              <div key={index} className="flex items-center space-x-2 space-x-reverse">
                {isCorrect ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <X className="h-4 w-4 text-slate-300" />
                )}
                <span className={isCorrect ? 'font-medium text-green-700' : 'text-slate-600'}>
                  {optLabel}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>עריכת שאלה</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>טקסט השאלה</Label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            disabled={saving}
          />
        </div>

        <div className="space-y-2">
          <Label>סוג שאלה</Label>
          <Select value={type} onValueChange={(value: any) => setType(value)} disabled={saving}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="single_choice">בחירה יחידה</SelectItem>
              <SelectItem value="multiple_choice">בחירה מרובה</SelectItem>
              <SelectItem value="true_false">נכון/לא נכון</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>אפשרויות</Label>
          <div className="space-y-2">
            {options.map((option, index) => (
              <div key={index} className="flex items-center space-x-2 space-x-reverse">
                {type === 'single_choice' ? (
                  <RadioGroup
                    value={correctAnswer[0]}
                    onValueChange={(value) => handleCorrectAnswerToggle(value, true)}
                  >
                    <RadioGroupItem value={option} />
                  </RadioGroup>
                ) : (
                  <Checkbox
                    checked={correctAnswer.includes(option)}
                    onCheckedChange={(checked) =>
                      handleCorrectAnswerToggle(option, checked as boolean)
                    }
                  />
                )}
                <Input
                  value={option}
                  onChange={(e) => handleOptionChange(index, e.target.value)}
                  placeholder={`אפשרות ${index + 1}`}
                  className="flex-1"
                  disabled={saving}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveOption(index)}
                  disabled={saving || options.length <= 2}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={handleAddOption} disabled={saving}>
            הוסף אפשרות
          </Button>
        </div>

        <div className="flex space-x-2 space-x-reverse">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 ml-2" />
            שמור
          </Button>
          <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>
            ביטול
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
