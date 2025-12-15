-- Create variation_margin table for storing variation margin entries
CREATE TABLE public.variation_margin (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  as_of_date DATE NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.variation_margin ENABLE ROW LEVEL SECURITY;

-- Create policies for full access (matching cash_bank_balance pattern)
CREATE POLICY "Anyone can view variation_margin" 
ON public.variation_margin 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can insert variation_margin" 
ON public.variation_margin 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update variation_margin" 
ON public.variation_margin 
FOR UPDATE 
USING (true);

CREATE POLICY "Anyone can delete variation_margin" 
ON public.variation_margin 
FOR DELETE 
USING (true);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_variation_margin_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_variation_margin_updated_at
BEFORE UPDATE ON public.variation_margin
FOR EACH ROW
EXECUTE FUNCTION public.update_variation_margin_updated_at();