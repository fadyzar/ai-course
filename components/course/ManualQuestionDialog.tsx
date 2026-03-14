'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ChevronRight, ChevronLeft, CircleCheck as CheckCircle2, Circle, Plus, Trash2, ArrowRight, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type TemplateType =
  | 'slide_title'
  | 'single_choice'
  | 'multiple_choice'
  | 'drag_drop'
  | 'ordering'
  | 'open_ended';

interface Template {
  id: TemplateType;
  title: string;
  description: string;
  color: string;
  borderColor: string;
  badgeBg: string;
  number: number;
}

const TEMPLATES: Template[] = [
  {
    id: 'slide_title',
    title: 'שקופית כותרת יחידה (שער)',
    description: 'צרו שקופית חדשה, צבעו את הרקע בצהוב, וכתבו את שם היחידה. המערכת תזהה אותה כתחילת יחידה חדשה.',
    color: 'bg-yellow-50',
    borderColor: 'border-yellow-400',
    badgeBg: 'bg-yellow-400',
    number: 1,
  },
  {
    id: 'single_choice',
    title: 'שאלת בחירה יחידה',
    description: 'כתבו את השאלה בכותרת השקופית, ואת התשובות ברשימה ממוספרת. סמנו כוכבית (*) בסוף התשובה הנכונה.',
    color: 'bg-blue-50',
    borderColor: 'border-blue-500',
    badgeBg: 'bg-blue-500',
    number: 2,
  },
  {
    id: 'multiple_choice',
    title: 'שאלת בחירה מרובה',
    description: 'אותו מבנה כמו בחירה יחידה, אבל סמנו כוכבית (*) ליד כל תשובה נכונה.',
    color: 'bg-cyan-50',
    borderColor: 'border-cyan-500',
    badgeBg: 'bg-cyan-500',
    number: 3,
  },
  {
    id: 'drag_drop',
    title: 'שאלת גרור ושחרר',
    description: 'צרו טבלה בשתי עמודות: פריט ויעד. המערכת תזהה את הטבלה ותייצר שאלת התאמה.',
    color: 'bg-orange-50',
    borderColor: 'border-orange-400',
    badgeBg: 'bg-orange-400',
    number: 4,
  },
  {
    id: 'ordering',
    title: 'שאלת מיון / סידור',
    description: 'כתבו רשימה ממוספרת בסדר הנכון. המערכת תערבב את הפריטים והתלמיד יסדר אותם.',
    color: 'bg-green-50',
    borderColor: 'border-green-500',
    badgeBg: 'bg-green-500',
    number: 5,
  },
  {
    id: 'open_ended',
    title: 'שאלה פתוחה (בדיקת AI)',
    description: 'כתבו את השאלה בכותרת השקופית, ואת התשובה כדוגמה בגוף השקופית. ה-AI ישתמש בתשובה לדוגמה לבדוק את תשובות התלמיד.',
    color: 'bg-red-50',
    borderColor: 'border-red-400',
    badgeBg: 'bg-red-400',
    number: 6,
  },
];

interface ManualQuestionDialogProps {
  courseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onQuestionAdded: () => void;
}

type Step = 'select_template' | 'fill_form';

interface MatchPair {
  item: string;
  target: string;
}

interface FormState {
  prompt: string;
  options: string[];
  correctAnswers: string[];
  correctAnswer: string;
  pairs: MatchPair[];
  orderedItems: string[];
  points: string;
}

const emptyForm = (): FormState => ({
  prompt: '',
  options: ['', '', '', ''],
  correctAnswers: [],
  correctAnswer: '',
  pairs: [{ item: '', target: '' }, { item: '', target: '' }, { item: '', target: '' }],
  orderedItems: ['', '', '', ''],
  points: '1',
});

export function ManualQuestionDialog({
  courseId,
  open,
  onOpenChange,
  onQuestionAdded,
}: ManualQuestionDialogProps) {
  const [step, setStep] = useState<Step>('select_template');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  const handleSelectTemplate = (template: Template) => {
    setSelectedTemplate(template);
    setForm(emptyForm());
    setStep('fill_form');
  };

  const handleBack = () => {
    setStep('select_template');
    setSelectedTemplate(null);
  };

  const handleClose = () => {
    setStep('select_template');
    setSelectedTemplate(null);
    setForm(emptyForm());
    onOpenChange(false);
  };

  const handleSave = async () => {
    if (!selectedTemplate) return;

    let questionData: any = null;

    if (selectedTemplate.id === 'slide_title') {
      if (!form.prompt.trim()) {
        toast.error('נא להזין כותרת יחידה');
        return;
      }
      questionData = {
        course_id: courseId,
        type: 'single_choice' as const,
        prompt: `[שקופית כותרת] ${form.prompt}`,
        options: [],
        correct_answer: [],
        confidence: 1,
        reviewed_by_teacher: true,
        reviewed_at: new Date().toISOString(),
      };
    } else if (selectedTemplate.id === 'single_choice') {
      const filledOptions = form.options.filter((o) => o.trim());
      if (!form.prompt.trim() || filledOptions.length < 2) {
        toast.error('נא למלא שאלה ולפחות 2 תשובות');
        return;
      }
      if (form.correctAnswers.length === 0) {
        toast.error('נא לסמן תשובה נכונה אחת');
        return;
      }
      questionData = {
        course_id: courseId,
        type: 'single_choice' as const,
        prompt: form.prompt,
        options: filledOptions,
        correct_answer: form.correctAnswers,
        confidence: 1,
        reviewed_by_teacher: true,
        reviewed_at: new Date().toISOString(),
      };
    } else if (selectedTemplate.id === 'multiple_choice') {
      const filledOptions = form.options.filter((o) => o.trim());
      if (!form.prompt.trim() || filledOptions.length < 2) {
        toast.error('נא למלא שאלה ולפחות 2 תשובות');
        return;
      }
      if (form.correctAnswers.length < 2) {
        toast.error('נא לסמן לפחות 2 תשובות נכונות');
        return;
      }
      questionData = {
        course_id: courseId,
        type: 'multiple_choice' as const,
        prompt: form.prompt,
        options: filledOptions,
        correct_answer: form.correctAnswers,
        confidence: 1,
        reviewed_by_teacher: true,
        reviewed_at: new Date().toISOString(),
      };
    } else if (selectedTemplate.id === 'drag_drop') {
      const filledPairs = form.pairs.filter((p) => p.item.trim() && p.target.trim());
      if (!form.prompt.trim() || filledPairs.length < 2) {
        toast.error('נא למלא שאלה ולפחות 2 זוגות התאמה');
        return;
      }
      const options = filledPairs.map((p) => p.item);
      const targets = filledPairs.map((p) => p.target);
      questionData = {
        course_id: courseId,
        type: 'single_choice' as const,
        prompt: form.prompt,
        options: options.map((item, i) => `${item} → ${targets[i]}`),
        correct_answer: options.map((item, i) => `${item} → ${targets[i]}`),
        confidence: 1,
        reviewed_by_teacher: true,
        reviewed_at: new Date().toISOString(),
        suggested_answer: { type: 'drag_drop', pairs: filledPairs },
      };
    } else if (selectedTemplate.id === 'ordering') {
      const filledItems = form.orderedItems.filter((o) => o.trim());
      if (!form.prompt.trim() || filledItems.length < 2) {
        toast.error('נא למלא שאלה ולפחות 2 פריטים לסידור');
        return;
      }
      questionData = {
        course_id: courseId,
        type: 'single_choice' as const,
        prompt: form.prompt,
        options: filledItems,
        correct_answer: filledItems,
        confidence: 1,
        reviewed_by_teacher: true,
        reviewed_at: new Date().toISOString(),
        suggested_answer: { type: 'ordering', items: filledItems },
      };
    } else if (selectedTemplate.id === 'open_ended') {
      if (!form.prompt.trim() || !form.correctAnswer.trim()) {
        toast.error('נא למלא שאלה ותשובה לדוגמה');
        return;
      }
      questionData = {
        course_id: courseId,
        type: 'single_choice' as const,
        prompt: form.prompt,
        options: [],
        correct_answer: [form.correctAnswer],
        confidence: 1,
        reviewed_by_teacher: true,
        reviewed_at: new Date().toISOString(),
        suggested_answer: { type: 'open_ended', sample: form.correctAnswer },
      };
    }

    if (!questionData) return;

    setSaving(true);
    try {
      const { error } = await (supabase.from('questions') as any).insert(questionData);
      if (error) throw error;
      toast.success('השאלה נוספה בהצלחה!');
      onQuestionAdded();
      setForm(emptyForm());
      setStep('select_template');
      setSelectedTemplate(null);
    } catch (err: any) {
      toast.error('שגיאה בשמירת השאלה: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddOption = () => {
    setForm((f) => ({ ...f, options: [...f.options, ''] }));
  };

  const handleRemoveOption = (index: number) => {
    const removed = form.options[index];
    setForm((f) => ({
      ...f,
      options: f.options.filter((_, i) => i !== index),
      correctAnswers: f.correctAnswers.filter((a) => a !== removed),
    }));
  };

  const handleOptionChange = (index: number, value: string) => {
    const old = form.options[index];
    const newOptions = [...form.options];
    newOptions[index] = value;
    setForm((f) => ({
      ...f,
      options: newOptions,
      correctAnswers: f.correctAnswers.map((a) => (a === old ? value : a)),
    }));
  };

  const toggleCorrect = (option: string, isSingle: boolean) => {
    if (isSingle) {
      setForm((f) => ({ ...f, correctAnswers: [option] }));
    } else {
      setForm((f) => ({
        ...f,
        correctAnswers: f.correctAnswers.includes(option)
          ? f.correctAnswers.filter((a) => a !== option)
          : [...f.correctAnswers, option],
      }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-slate-900">
            {step === 'select_template' ? 'בחר תבנית שאלה' : selectedTemplate?.title}
          </DialogTitle>
        </DialogHeader>

        {step === 'select_template' && (
          <div className="space-y-3 py-2">
            <p className="text-sm text-slate-500">בחר את סוג השאלה שברצונך להוסיף לקורס:</p>
            <div className="grid gap-3">
              {TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleSelectTemplate(template)}
                  className={cn(
                    'w-full text-right rounded-xl border-2 p-4 transition-all duration-150 hover:shadow-md',
                    template.color,
                    template.borderColor
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        'shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white text-sm font-bold mt-0.5',
                        template.badgeBg
                      )}
                    >
                      {template.number}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 text-sm">{template.title}</p>
                      <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                        {template.description}
                      </p>
                    </div>
                    <ChevronLeft className="h-4 w-4 text-slate-400 shrink-0 mt-1" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'fill_form' && selectedTemplate && (
          <div className="space-y-5 py-2">
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
              חזור לבחירת תבנית
            </button>

            <div
              className={cn(
                'rounded-xl border-2 p-3',
                selectedTemplate.color,
                selectedTemplate.borderColor
              )}
            >
              <p className="text-xs text-slate-600 leading-relaxed">
                {selectedTemplate.description}
              </p>
            </div>

            {selectedTemplate.id === 'slide_title' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">כותרת היחידה</Label>
                  <Input
                    value={form.prompt}
                    onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
                    placeholder="הזן את שם היחידה..."
                    disabled={saving}
                  />
                </div>
              </div>
            )}

            {(selectedTemplate.id === 'single_choice' ||
              selectedTemplate.id === 'multiple_choice') && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">טקסט השאלה</Label>
                  <Textarea
                    value={form.prompt}
                    onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
                    placeholder="הזן את השאלה..."
                    rows={2}
                    disabled={saving}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    תשובות{' '}
                    <span className="text-slate-400 font-normal">
                      (סמן{selectedTemplate.id === 'multiple_choice' ? 'י' : ''} את הנכונ
                      {selectedTemplate.id === 'multiple_choice' ? 'ות' : 'ה'})
                    </span>
                  </Label>
                  <div className="space-y-2">
                    {form.options.map((option, index) => {
                      const isCorrect = form.correctAnswers.includes(option) && option.trim() !== '';
                      return (
                        <div key={index} className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => option.trim() && toggleCorrect(option, selectedTemplate.id === 'single_choice')}
                            className="shrink-0 transition-colors"
                            disabled={saving}
                          >
                            {isCorrect ? (
                              <CheckCircle2 className="h-5 w-5 text-green-600" />
                            ) : (
                              <Circle className="h-5 w-5 text-slate-300 hover:text-slate-400" />
                            )}
                          </button>
                          <Input
                            value={option}
                            onChange={(e) => handleOptionChange(index, e.target.value)}
                            placeholder={`תשובה ${index + 1}`}
                            className={cn(
                              'flex-1 transition-colors',
                              isCorrect && 'border-green-400 bg-green-50'
                            )}
                            disabled={saving}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveOption(index)}
                            disabled={saving || form.options.length <= 2}
                            className="h-8 w-8 p-0 text-slate-400 hover:text-red-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddOption}
                    disabled={saving}
                    className="gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    הוסף תשובה
                  </Button>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">ניקוד</Label>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={form.points}
                    onChange={(e) => setForm((f) => ({ ...f, points: e.target.value }))}
                    className="w-24"
                    disabled={saving}
                  />
                </div>
              </div>
            )}

            {selectedTemplate.id === 'drag_drop' && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">טקסט השאלה</Label>
                  <Textarea
                    value={form.prompt}
                    onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
                    placeholder="הזן את השאלה..."
                    rows={2}
                    disabled={saving}
                  />
                </div>

                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-xs font-medium text-slate-500 px-1">
                    <span>פריט</span>
                    <span>יעד</span>
                  </div>
                  {form.pairs.map((pair, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={pair.item}
                        onChange={(e) => {
                          const newPairs = [...form.pairs];
                          newPairs[index] = { ...pair, item: e.target.value };
                          setForm((f) => ({ ...f, pairs: newPairs }));
                        }}
                        placeholder={`פריט ${index + 1}`}
                        className="flex-1"
                        disabled={saving}
                      />
                      <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" />
                      <Input
                        value={pair.target}
                        onChange={(e) => {
                          const newPairs = [...form.pairs];
                          newPairs[index] = { ...pair, target: e.target.value };
                          setForm((f) => ({ ...f, pairs: newPairs }));
                        }}
                        placeholder={`יעד ${index + 1}`}
                        className="flex-1"
                        disabled={saving}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setForm((f) => ({ ...f, pairs: f.pairs.filter((_, i) => i !== index) }))
                        }
                        disabled={saving || form.pairs.length <= 2}
                        className="h-8 w-8 p-0 text-slate-400 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setForm((f) => ({ ...f, pairs: [...f.pairs, { item: '', target: '' }] }))
                    }
                    disabled={saving}
                    className="gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    הוסף זוג
                  </Button>
                </div>
              </div>
            )}

            {selectedTemplate.id === 'ordering' && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">טקסט השאלה</Label>
                  <Textarea
                    value={form.prompt}
                    onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
                    placeholder="הזן את השאלה..."
                    rows={2}
                    disabled={saving}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    פריטים לסידור{' '}
                    <span className="text-slate-400 font-normal">(בסדר הנכון)</span>
                  </Label>
                  {form.orderedItems.map((item, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-slate-300 shrink-0" />
                      <span className="text-xs font-medium text-slate-400 w-5 shrink-0">
                        {index + 1}.
                      </span>
                      <Input
                        value={item}
                        onChange={(e) => {
                          const newItems = [...form.orderedItems];
                          newItems[index] = e.target.value;
                          setForm((f) => ({ ...f, orderedItems: newItems }));
                        }}
                        placeholder={`פריט ${index + 1}`}
                        className="flex-1"
                        disabled={saving}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            orderedItems: f.orderedItems.filter((_, i) => i !== index),
                          }))
                        }
                        disabled={saving || form.orderedItems.length <= 2}
                        className="h-8 w-8 p-0 text-slate-400 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setForm((f) => ({ ...f, orderedItems: [...f.orderedItems, ''] }))
                    }
                    disabled={saving}
                    className="gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    הוסף פריט
                  </Button>
                </div>
              </div>
            )}

            {selectedTemplate.id === 'open_ended' && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">טקסט השאלה</Label>
                  <Textarea
                    value={form.prompt}
                    onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
                    placeholder="הזן את השאלה..."
                    rows={2}
                    disabled={saving}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">
                    תשובה לדוגמה{' '}
                    <span className="text-slate-400 font-normal">(ה-AI ישתמש בה לבדיקה)</span>
                  </Label>
                  <Textarea
                    value={form.correctAnswer}
                    onChange={(e) => setForm((f) => ({ ...f, correctAnswer: e.target.value }))}
                    placeholder="הזן את התשובה הנכונה לדוגמה..."
                    rows={3}
                    disabled={saving}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">ניקוד</Label>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={form.points}
                    onChange={(e) => setForm((f) => ({ ...f, points: e.target.value }))}
                    className="w-24"
                    disabled={saving}
                  />
                </div>
              </div>
            )}

            <Separator />

            <div className="flex justify-between items-center pt-1">
              <Button variant="outline" onClick={handleBack} disabled={saving}>
                ביטול
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
              >
                {saving ? (
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                הוסף שאלה
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
