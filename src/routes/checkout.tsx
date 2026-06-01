import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/lib/cart";
import { ArrowLeft, CreditCard, Wallet, Banknote, CheckCircle2, Download, ShoppingBag, Trash2, Minus, Plus, Sparkles, LayoutDashboard, ChevronRight, Home } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getProducts } from "@/lib/products.functions";
import { ProductImage } from "@/components/ProductImage";
import { Badge } from "@/components/ui/badge";
import { useAdmin } from "@/lib/admin";
import { DebugPanel } from "@/components/DebugPanel";

const productsQueryOptions = queryOptions({
  queryKey: ["products"],
  queryFn: () => getProducts(),
  staleTime: 5 * 60 * 1000,
});

export const Route = createFileRoute("/checkout")({
  loader: ({ context }) => context.queryClient.ensureQueryData(productsQueryOptions),
  component: CheckoutPage,
});

function CheckoutPage() {
  const { items, totalPrice, updateQuantity, removeItem, clearCart, addItem } = useCart();
  const { data: allProducts } = useSuspenseQuery(productsQueryOptions);
  const isAdmin = useAdmin();
  const navigate = useNavigate();
  
  const [paymentMethod, setPaymentMethod] = useState<string>("upi");
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => { setIsLoaded(true); }, []);

  // AI-like recommendation logic: suggest items from categories NOT in cart
  const recommendations = useMemo(() => {
    const inCartCategories = new Set(items.map(i => i.category));
    const suggested = allProducts
      .filter(p => !inCartCategories.has(p.category) && !items.find(i => i.id === p.id))
      .sort(() => 0.5 - Math.random())
      .slice(0, 3);
    return suggested;
  }, [items, allProducts]);

  const handlePay = () => {
    if (items.length === 0) {
      toast.error("Your cart is empty");
      return;
    }
    setIsPaying(true);
    setTimeout(() => {
      setIsPaying(false);
      setIsSuccessOpen(true);
    }, 1800);
  };

  const generateInvoice = () => {
    const orderId = `INV-${Math.floor(Math.random() * 1000000).toString().padStart(6, "0")}`;
    const date = new Date().toLocaleDateString();
    
    let content = `SHOPMIND INVOICE\n`;
    content += `====================\n`;
    content += `Order ID: ${orderId}\n`;
    content += `Date: ${date}\n`;
    content += `Payment Method: ${paymentMethod.toUpperCase()}\n`;
    content += `====================\n\n`;
    content += `ITEMS:\n`;
    
    items.forEach(item => {
      content += `${item.name} x ${item.quantity}\n`;
      content += `Price: ₹${item.price.toLocaleString("en-IN")}\n`;
      content += `Subtotal: ₹${(item.price * item.quantity).toLocaleString("en-IN")}\n`;
      content += `--------------------\n`;
    });
    
    content += `\nTOTAL: ₹${totalPrice.toLocaleString("en-IN")}\n`;
    content += `====================\n`;
    content += `Thank you for shopping with ShopMind!\n`;

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `invoice-${orderId}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast.success("Invoice downloaded");
  };

  if (items.length === 0 && !isSuccessOpen) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 animate-in fade-in duration-700">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-accent/30 text-muted-foreground animate-bounce">
          <ShoppingBag className="h-12 w-12" />
        </div>
        <h1 className="mt-8 font-display text-3xl text-foreground tracking-tight">Your cart is empty</h1>
        <p className="mt-3 text-center text-muted-foreground max-w-xs">The best time to style your home was yesterday. The second best time is now.</p>
        <div className="mt-10">
          <Button asChild className="rounded-full px-8 h-12 shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95">
            <Link to="/">Start styling with AI <ArrowLeft className="ml-2 h-4 w-4 rotate-180" /></Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-muted/20 pb-24 pt-8 transition-all duration-700 ${isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
      <div className="mx-auto max-w-5xl px-6">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => window.history.back()} 
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors group"
            >
              <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" /> Back
            </button>
            <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors group">
              <Home className="h-4 w-4" /> Home
            </Link>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10 gap-1.5 px-3">
                <LayoutDashboard className="h-3 w-3" /> Admin View
              </Badge>
            </div>
          )}
        </div>

        <div className="flex items-end gap-3 mb-10">
          <h1 className="font-display text-4xl text-foreground tracking-tight">Checkout</h1>
          <span className="mb-1.5 text-muted-foreground text-sm font-medium">{items.length} items ready to ship</span>
        </div>

        <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
          <div className="space-y-8">
            {/* 1. Review Items */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 px-1">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Order Details</h2>
              </div>
              <Card className="rounded-[2rem] border-none bg-card shadow-xl shadow-foreground/5 overflow-hidden">
                <CardContent className="p-0">
                  <div className="divide-y divide-border/50">
                    {items.map((item) => (
                      <div key={item.id} className="flex gap-6 p-6 transition-colors hover:bg-accent/5 group">
                        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-border/50 bg-muted transition-transform group-hover:scale-105 duration-500">
                          <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                        </div>
                        <div className="flex flex-1 flex-col justify-between py-1">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-primary font-bold mb-1">{item.category}</p>
                              <h3 className="text-base font-semibold text-foreground leading-tight">{item.name}</h3>
                            </div>
                            <div className="text-right">
                              <p className="text-base font-display">₹{item.price.toLocaleString("en-IN")}</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between mt-4">
                            <div className="flex items-center gap-3 bg-muted/50 rounded-full p-1 border border-border/50">
                              <button 
                                onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                className="flex h-7 w-7 items-center justify-center rounded-full bg-background shadow-sm hover:bg-primary hover:text-primary-foreground transition-all"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="w-5 text-center text-xs font-bold">{item.quantity}</span>
                              <button 
                                onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                className="flex h-7 w-7 items-center justify-center rounded-full bg-background shadow-sm hover:bg-primary hover:text-primary-foreground transition-all"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <button 
                              onClick={() => removeItem(item.id)}
                              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-all"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* 2. Recommendations */}
            {recommendations.length > 0 && (
              <section className="space-y-4 animate-in fade-in slide-in-from-bottom duration-1000 delay-300">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Complete the Look</h2>
                  </div>
                  <span className="text-[10px] font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">AI Picks</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {recommendations.map((p) => (
                    <Card key={p.id} className="rounded-3xl border-none bg-card shadow-lg shadow-foreground/5 p-3 group">
                      <div className="h-32 w-full overflow-hidden rounded-2xl bg-muted mb-3">
                        <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover transition-transform group-hover:scale-110 duration-700" />
                      </div>
                      <h4 className="text-xs font-bold truncate px-1">{p.name}</h4>
                      <div className="flex items-center justify-between mt-2 px-1">
                        <span className="text-xs font-medium">₹{p.price.toLocaleString("en-IN")}</span>
                        <button 
                          onClick={() => { addItem(p); toast.success("Added recommendation!"); }}
                          className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-all"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {/* 3. Payment */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 px-1">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Secure Payment</h2>
              </div>
              <Card className="rounded-[2rem] border-none bg-card shadow-xl shadow-foreground/5 p-6">
                <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod} className="space-y-4">
                  <PaymentOption id="upi" value="upi" icon={<Wallet className="h-5 w-5" />} label="UPI" desc="Google Pay, PhonePe, Paytm" />
                  <PaymentOption id="card" value="card" icon={<CreditCard className="h-5 w-5" />} label="Card" desc="Credit / Debit Card" />
                  <PaymentOption id="cash" value="cash" icon={<Banknote className="h-5 w-5" />} label="Cash" desc="Cash on Delivery" />
                </RadioGroup>
              </Card>
            </section>
          </div>

          <div className="space-y-8 lg:sticky lg:top-24 h-fit">
            <Card className="rounded-[2.5rem] border-none bg-primary text-primary-foreground shadow-2xl shadow-primary/20 p-8">
              <h3 className="text-lg font-display mb-6">Summary</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm opacity-80">
                  <span>Subtotal</span>
                  <span>₹{totalPrice.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex items-center justify-between text-sm opacity-80">
                  <span>Shipping</span>
                  <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px] font-bold">FREE</span>
                </div>
                <Separator className="bg-white/20" />
                <div className="flex items-center justify-between text-2xl font-display pt-2">
                  <span>Total</span>
                  <span>₹{totalPrice.toLocaleString("en-IN")}</span>
                </div>
              </div>
              <Button 
                className="w-full h-14 rounded-full mt-8 bg-white text-primary hover:bg-white/90 font-bold text-lg transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50" 
                onClick={handlePay}
                disabled={isPaying}
              >
                {isPaying ? "Verifying..." : `Pay Securely`}
                {!isPaying && <ChevronRight className="ml-2 h-5 w-5" />}
              </Button>
            </Card>

            {isAdmin && (
              <div className="animate-in fade-in duration-1000 delay-500">
                <DebugPanel 
                  query="checkout_process" 
                  intent={null as any} 
                  label="Debug Recommendations" 
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={isSuccessOpen} onOpenChange={(v) => !v && setIsSuccessOpen(false)}>
        <DialogContent className="sm:max-w-md rounded-[3rem] p-8 overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-emerald-400 to-teal-500" />
          <div className="flex flex-col items-center text-center py-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-6 animate-in zoom-in spin-in-90 duration-700">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <DialogTitle className="text-3xl font-display tracking-tight mb-2">Order Confirmed!</DialogTitle>
            <DialogDescription className="text-base text-muted-foreground max-w-[280px]">
              Your styling items are being packed and will arrive in 3-5 days.
            </DialogDescription>
            
            <div className="mt-10 w-full flex flex-col gap-3">
              <Button onClick={generateInvoice} variant="outline" className="w-full h-12 rounded-full font-bold group">
                <Download className="mr-2 h-4 w-4 group-hover:translate-y-0.5 transition-transform" /> Download Invoice
              </Button>
              <Button onClick={() => { setIsSuccessOpen(false); clearCart(); }} className="w-full h-12 rounded-full font-bold" asChild>
                <Link to="/">Explore more vibes</Link>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PaymentOption({ id, value, icon, label, desc }: { id: string; value: string; icon: React.ReactNode; label: string; desc: string }) {
  return (
    <div className="flex items-center space-x-3 rounded-2xl border border-border/50 p-4 transition-all has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 group">
      <RadioGroupItem value={value} id={id} className="border-primary text-primary" />
      <Label htmlFor={id} className="flex flex-1 items-center gap-4 cursor-pointer">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-accent/50 text-accent-foreground group-has-[[data-state=checked]]:bg-primary group-has-[[data-state=checked]]:text-primary-foreground transition-colors">
          {icon}
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="font-bold text-sm">{label}</span>
          <span className="text-[11px] text-muted-foreground">{desc}</span>
        </div>
      </Label>
    </div>
  );
}
