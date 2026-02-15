/*
  # Fix Question Correct Answers
  
  This migration fixes questions where correct_answer contains numeric indices instead of the actual answer text.
  It converts correct_answer from [0] to [options[0]] for all affected questions.
  
  1. Changes
    - Updates all questions where correct_answer is a numeric index
    - Converts the index to the actual option text from the options array
  
  2. Notes
    - Only affects questions with numeric correct_answer values
    - Uses DO block with PL/pgSQL to handle JSONB operations
*/

DO $$
DECLARE
  q RECORD;
  idx INTEGER;
  new_answer TEXT;
BEGIN
  FOR q IN 
    SELECT id, options, correct_answer 
    FROM questions 
    WHERE type = 'single_choice'
  LOOP
    -- Check if correct_answer[1] is numeric
    BEGIN
      idx := (q.correct_answer[1])::INTEGER;
      
      -- Get the actual option text at that index
      new_answer := (q.options->idx)::TEXT;
      
      -- Remove quotes if present
      new_answer := TRIM(BOTH '"' FROM new_answer);
      
      -- Update the question with the actual answer text
      UPDATE questions 
      SET correct_answer = ARRAY[new_answer]
      WHERE id = q.id;
      
      RAISE NOTICE 'Fixed question % - changed [%] to [%]', q.id, idx, new_answer;
      
    EXCEPTION
      WHEN OTHERS THEN
        -- If conversion fails, the correct_answer is already text, skip it
        CONTINUE;
    END;
  END LOOP;
END $$;
