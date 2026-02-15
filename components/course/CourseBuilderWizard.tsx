'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';

interface Step {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'active' | 'completed';
}

interface CourseBuilderWizardProps {
  currentStep: 'upload' | 'processing' | 'ready';
  hasAssets: boolean;
  isProcessing: boolean;
}

export function CourseBuilderWizard({ currentStep, hasAssets, isProcessing }: CourseBuilderWizardProps) {
  const steps: Step[] = [
    {
      id: 'upload',
      title: 'העלאת קבצים',
      description: hasAssets ? 'הועלו קבצים בהצלחה' : 'העלה קובץ PPTX, PDF או מסמך',
      status: currentStep === 'upload' && !hasAssets ? 'active' : hasAssets ? 'completed' : 'pending',
    },
    {
      id: 'processing',
      title: 'עיבוד ובנייה',
      description: isProcessing ? 'מעבד את הקבצים...' : hasAssets && currentStep === 'processing' ? 'מוכן לעיבוד' : 'ממתין לקבצים',
      status: currentStep === 'processing' ? (isProcessing ? 'active' : hasAssets ? 'active' : 'pending') : currentStep === 'ready' ? 'completed' : 'pending',
    },
    {
      id: 'ready',
      title: 'קורס מוכן',
      description: currentStep === 'ready' ? 'הקורס מוכן ללמידה!' : 'הקורס יהיה מוכן בקרוב',
      status: currentStep === 'ready' ? 'completed' : 'pending',
    },
  ];

  return (
    <Card className="border-2">
      <CardContent className="pt-6">
        <div className="space-y-6">
          <div className="text-center mb-8">
            <h3 className="text-xl font-bold text-slate-900 mb-2">תהליך יצירת הקורס</h3>
            <p className="text-sm text-slate-600">עקוב אחר התקדמות הקורס שלך</p>
          </div>

          <div className="relative">
            {steps.map((step, index) => (
              <div key={step.id} className="relative">
                {index !== steps.length - 1 && (
                  <div
                    className={`absolute right-[23px] top-12 h-16 w-0.5 ${
                      step.status === 'completed' ? 'bg-green-500' : 'bg-slate-200'
                    }`}
                  />
                )}
                <div className="flex items-start gap-4 pb-8">
                  <div className="flex-shrink-0">
                    {step.status === 'completed' ? (
                      <div className="relative">
                        <CheckCircle2 className="h-12 w-12 text-green-500" />
                      </div>
                    ) : step.status === 'active' ? (
                      <div className="relative">
                        {isProcessing && step.id === 'processing' ? (
                          <Loader2 className="h-12 w-12 text-blue-500 animate-spin" />
                        ) : (
                          <div className="h-12 w-12 rounded-full border-4 border-blue-500 bg-blue-50 flex items-center justify-center">
                            <span className="text-lg font-bold text-blue-600">{index + 1}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="h-12 w-12 rounded-full border-2 border-slate-300 bg-slate-50 flex items-center justify-center">
                        <span className="text-lg font-medium text-slate-400">{index + 1}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 pt-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className={`text-lg font-semibold ${
                        step.status === 'completed' ? 'text-green-700' :
                        step.status === 'active' ? 'text-blue-700' :
                        'text-slate-500'
                      }`}>
                        {step.title}
                      </h4>
                      {step.status === 'completed' && (
                        <Badge variant="default" className="bg-green-500">הושלם</Badge>
                      )}
                      {step.status === 'active' && (
                        <Badge variant="default" className="bg-blue-500">פעיל</Badge>
                      )}
                    </div>
                    <p className={`text-sm ${
                      step.status === 'active' ? 'text-slate-700' : 'text-slate-500'
                    }`}>
                      {step.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {currentStep === 'ready' && (
            <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4 text-center">
              <p className="text-green-800 font-semibold text-lg">🎉 הקורס שלך מוכן!</p>
              <p className="text-green-700 text-sm mt-1">עכשיו אפשר לצפות בו או להתחיל ללמוד</p>
            </div>
          )}

          {currentStep === 'upload' && !hasAssets && (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
              <p className="text-blue-800 font-semibold mb-2">👋 בוא נתחיל!</p>
              <ol className="list-decimal list-inside text-sm text-blue-700 space-y-1">
                <li>העלה קובץ PPTX, PDF, או מסמך אחר</li>
                <li>לחץ על "התחל עיבוד"</li>
                <li>המתן שהמערכת תבנה את הקורס</li>
              </ol>
            </div>
          )}

          {hasAssets && currentStep === 'processing' && !isProcessing && (
            <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4">
              <p className="text-amber-800 font-semibold mb-2">⏳ הקבצים מוכנים!</p>
              <p className="text-amber-700 text-sm">לחץ על כפתור "התחל עיבוד" למטה כדי להתחיל לבנות את הקורס</p>
            </div>
          )}

          {isProcessing && (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                <div>
                  <p className="text-blue-800 font-semibold">מעבד כעת...</p>
                  <p className="text-blue-700 text-sm">זה יכול לקחת מספר דקות, אנא המתן</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
