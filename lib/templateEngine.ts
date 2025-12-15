import { METYCLE_INFO } from "./templateVariables";

interface TemplateData {
  metycle?: any;
  bl_extraction?: any;
  bl_order?: any;
  order?: any;
  company?: any;
  company_address?: any;
  containers?: any[];
  ticket?: any;
  document_comment?: string;
}

/**
 * Template engine for replacing placeholders with actual data
 * Supports:
 * - Simple variables: {{variable_name}}
 * - Repeating sections: {{#containers}}...{{/containers}}
 */
export class TemplateEngine {
  private data: TemplateData;

  constructor(data: TemplateData) {
    this.data = {
      ...data,
      metycle: METYCLE_INFO,
    };
  }

  /**
   * Process template and replace all placeholders
   */
  process(template: string): string {
    // First, process repeating sections
    let result = this.processRepeatingSections(template);

    // Then, replace simple variables
    result = this.replaceVariables(result);

    return result;
  }

  /**
   * Process repeating sections like {{#containers}}...{{/containers}}
   */
  private processRepeatingSections(template: string): string {
    const sectionRegex = /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;

    return template.replace(sectionRegex, (match, sectionName, sectionContent) => {
      const sectionData = this.data[sectionName as keyof TemplateData];

      if (!Array.isArray(sectionData)) {
        return ""; // Section data not found or not an array
      }

      // Repeat the section content for each item
      return sectionData
        .map((item) => {
          return sectionContent.replace(/\{\{(\w+)\}\}/g, (_, varName: string) => {
            let value = item[varName];
            // Convert container weights from MT to KG (*1000)
            if ((varName === "net_weight" || varName === "gross_weight") && value != null) {
              return (Number(value) * 1000).toLocaleString();
            }
            return this.formatValue(value);
          });
        })
        .join("");
    });
  }

  /**
   * Replace simple variables like {{variable_name}}
   */
  private replaceVariables(template: string): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      const value = this.resolveValue(varName);
      return this.formatValue(value);
    });
  }

  /**
   * Escape HTML special characters to prevent injection
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Resolve variable value from nested data structure
   */
  private resolveValue(varName: string): any {
    // Handle current_date special variable
    if (varName === "current_date") {
      return new Date().toISOString().split('T')[0];
    }


    // Handle document_notes_section - render full notes inline only if comment exists
    if (varName === "document_notes_section") {
      const comment = this.data.document_comment;
      if (!comment) return "";
      // Join multiple lines into a single line with spaces
      const escapedComment = this.escapeHtml(comment).replace(/\n/g, ' ');
      return `<p class="notes"><strong>Notes / Special Instructions:</strong> ${escapedComment}</p>`;
    }

    // Handle raw document_comment variable
    if (varName === "document_comment") {
      const comment = this.data.document_comment;
      if (!comment) return "";
      return this.escapeHtml(comment).replace(/\n/g, '<br/>');
    }

    // Handle product_details - prefer bl_extraction.product_description for all templates
    if (varName === "product_details" && this.data.bl_extraction?.product_description) {
      return this.data.bl_extraction.product_description;
    }

    // Handle description_of_goods - map to bl_extraction.product_description
    if (varName === "description_of_goods" && this.data.bl_extraction?.product_description) {
      return this.data.bl_extraction.product_description;
    }

    // Handle weight conversions - convert from MT to KG (*1000)
    if (varName === "total_net_weight" && this.data.bl_extraction?.total_net_weight != null) {
      return (Number(this.data.bl_extraction.total_net_weight) * 1000).toLocaleString();
    }
    if (varName === "total_gross_weight" && this.data.bl_extraction?.total_gross_weight != null) {
      return (Number(this.data.bl_extraction.total_gross_weight) * 1000).toLocaleString();
    }

    // Handle container_numbers - aggregate all container numbers into comma-separated string
    if (varName === "container_numbers" && this.data.containers?.length) {
      return this.data.containers
        .map((c: any) => c.container_number)
        .filter(Boolean)
        .join(", ");
    }

    // Handle container_size - aggregate all container sizes into comma-separated string
    if (varName === "container_size" && this.data.containers?.length) {
      return this.data.containers
        .map((c: any) => c.container_size)
        .filter(Boolean)
        .join(", ");
    }

    // Handle package_number - map to bl_extraction.number_of_packages
    if (varName === "package_number" && this.data.bl_extraction?.number_of_packages != null) {
      return this.data.bl_extraction.number_of_packages;
    }

    // Handle on_board_date - map to bl_extraction.onboard_date
    if (varName === "on_board_date" && this.data.bl_extraction?.onboard_date) {
      return this.data.bl_extraction.onboard_date;
    }

    // Handle bl_order_name - prioritize bl_order data
    if (varName === "bl_order_name") {
      if (this.data.bl_order?.bl_order_name) {
        return this.data.bl_order.bl_order_name;
      }
      if (this.data.bl_extraction?.bl_order_name) {
        return this.data.bl_extraction.bl_order_name;
      }
    }

    // Handle consignee tax detail LINES FIRST (render full line or empty string)
    // These must be checked BEFORE general source lookup to avoid returning raw values
    if (varName === "consignee_vat_line") {
      const val = this.data.company_address?.VAT_id;
      return val ? `<p>VAT ID: ${val}</p>` : "";
    }
    if (varName === "consignee_pan_line") {
      const val = this.data.company_address?.pan_number;
      return val ? `<p>PAN: ${val}</p>` : "";
    }
    if (varName === "consignee_iec_line") {
      const val = this.data.company_address?.iec_code;
      return val ? `<p>IEC: ${val}</p>` : "";
    }

    // Direct lookup first
    if (varName in this.data) {
      return (this.data as any)[varName];
    }

    // Handle prefixed variables (e.g., metycle_name -> look for 'name' in metycle object)
    const prefixMap = {
      'metycle_': 'metycle',
      'bl_': 'bl_extraction',
      'bl_order_': 'bl_order',
      'order_': 'order',
      'purchaser_': 'company',
      'seller_': 'company',
      'buyer_': 'company',
    };

    for (const [prefix, sourceName] of Object.entries(prefixMap)) {
      if (varName.startsWith(prefix)) {
        const fieldName = varName.substring(prefix.length);
        const source = (this.data as any)[sourceName];
        if (source && fieldName in source) {
          return source[fieldName];
        }
      }
    }

    // Check in each data source directly
    const sources = [
      this.data.metycle,
      this.data.bl_extraction,
      this.data.bl_order,
      this.data.order,
      this.data.company,
      this.data.company_address,
    ];

    for (const source of sources) {
      if (source && varName in source) {
        return source[varName];
      }
    }

    // Handle special computed fields
    if (varName === "total_sell_value" && this.data.order) {
      const qty = this.data.order.allocated_quantity_mt || 0;
      const price = this.data.order.sell_price || 0;
      return qty * price;
    }

    if (varName === "total_buy_value" && this.data.order) {
      const qty = this.data.order.allocated_quantity_mt || 0;
      const price = this.data.order.buy_price || 0;
      return qty * price;
    }

    // Handle formatted payment terms: combines payment_terms + payment_trigger_event + payment_offset_days
    if (varName === "formatted_payment_terms" && this.data.ticket) {
      const paymentTerms = this.data.ticket.payment_terms || "";
      const triggerEvent = this.data.ticket.payment_trigger_event || "";
      const offsetDays = this.data.ticket.payment_offset_days;
      
      if (paymentTerms && triggerEvent && offsetDays !== null && offsetDays !== undefined) {
        const absOffset = Math.abs(Number(offsetDays));
        const timing = Number(offsetDays) < 0 ? "before" : "after";
        return `${paymentTerms}, ${absOffset} days ${timing} ${triggerEvent}`;
      }
      return paymentTerms;
    }

    // Handle formatted basis with payable percent: "3M LLME 57%"
    if (varName === "basis_with_payable" && this.data.ticket) {
      const basis = this.data.ticket.basis || "";
      const payablePercent = this.data.ticket.payable_percent;
      
      if (basis && payablePercent !== null && payablePercent !== undefined) {
        // Convert decimal to percentage (0.57 -> 57, or if already >1 use as-is)
        const percentValue = Number(payablePercent) > 1.5 ? Number(payablePercent) : Number(payablePercent) * 100;
        return `${basis} ${Math.round(percentValue)}%`;
      }
      return basis;
    }

    // Handle conditional pricing basis line - only shows for Formula/Index, not Fixed
    if (varName === "pricing_basis_line" && this.data.ticket) {
      const pricingType = this.data.ticket.pricing_type;
      const basis = this.data.ticket.basis || "";
      
      // Don't show for Fixed pricing
      if (!pricingType || pricingType === "Fixed") {
        return "";
      }
      
      if (pricingType === "Formula") {
        const payablePercent = this.data.ticket.payable_percent;
        if (basis && payablePercent !== null && payablePercent !== undefined) {
          const percentValue = Number(payablePercent) > 1.5 ? Number(payablePercent) : Number(payablePercent) * 100;
          return `<p><strong>Pricing basis:</strong> ${basis} ${Math.round(percentValue)}%</p>`;
        }
        return basis ? `<p><strong>Pricing basis:</strong> ${basis}</p>` : "";
      }
      
      if (pricingType === "Index") {
        const premiumDiscount = this.data.ticket.premium_discount;
        if (basis && premiumDiscount !== null && premiumDiscount !== undefined) {
          const sign = Number(premiumDiscount) >= 0 ? "+" : "";
          return `<p><strong>Pricing basis:</strong> ${basis} ${sign}${Number(premiumDiscount).toLocaleString()}</p>`;
        }
        return basis ? `<p><strong>Pricing basis:</strong> ${basis}</p>` : "";
      }
      
      return "";
    }

    // Handle conditional delivery_location_line for Purchase Order - hide if incoterms is EXW
    if (varName === "delivery_location_line" && this.data.ticket) {
      const incoterms = this.data.ticket.incoterms;
      const shipTo = this.data.ticket.ship_to || this.data.order?.ship_to;
      
      // Don't show delivery location for EXW incoterms
      if (incoterms === "EXW" || !shipTo) {
        return "";
      }
      
      return `<p><strong>Delivery location:</strong> ${shipTo}</p>`;
    }

    // Handle ticket fields directly
    if (varName === "ticket_product_details" && this.data.ticket) {
      return this.data.ticket.product_details;
    }
    
    if (varName === "payment_terms" && this.data.ticket) {
      return this.data.ticket.payment_terms;
    }

    // Handle company address aliases
    if (varName === "buyer_address" && this.data.company_address) {
      return this.data.company_address.line1;
    }

    if (varName === "seller_address" && this.data.company_address) {
      return this.data.company_address.line1;
    }
    
    if (varName === "purchaser_address" && this.data.company_address) {
      return this.data.company_address.line1;
    }
    
    // Handle contact person aliases
    if (varName === "seller_contact_name" && this.data.company_address) {
      return this.data.company_address.contact_name_1;
    }
    
    if (varName === "seller_contact_email" && this.data.company_address) {
      return this.data.company_address.email_1;
    }
    
    if (varName === "purchaser_contact_name" && this.data.company_address) {
      return this.data.company_address.contact_name_1;
    }
    
    if (varName === "purchaser_contact_email" && this.data.company_address) {
      return this.data.company_address.email_1;
    }
    
    if (varName === "purchaser_vat" && this.data.company_address) {
      return this.data.company_address.VAT_id;
    }

    // Handle consignee tax details (only show if not null)
    if (varName === "consignee_vat_id" && this.data.company_address?.VAT_id) {
      return this.data.company_address.VAT_id;
    }
    if (varName === "consignee_pan_number" && this.data.company_address?.pan_number) {
      return this.data.company_address.pan_number;
    }
    if (varName === "consignee_iec_code" && this.data.company_address?.iec_code) {
      return this.data.company_address.iec_code;
    }

    // Handle city/country aliases
    if ((varName === "seller_city" || varName === "purchaser_city") && this.data.company_address) {
      return this.data.company_address.city;
    }
    
    if ((varName === "seller_country" || varName === "purchaser_country") && this.data.company_address) {
      return this.data.company_address.country;
    }

    return undefined;
  }

  /**
   * Format value for display
   */
  private formatValue(value: any): string {
    if (value === null || value === undefined) {
      return "—";
    }

    // Empty strings are valid (used for conditional line variables)
    if (value === "") {
      return "";
    }

    if (typeof value === "number") {
      return value.toLocaleString("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
    }

    if (value instanceof Date) {
      return value.toLocaleDateString("en-US");
    }

    // Handle date strings
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString("en-US");
      }
    }

    return String(value);
  }

  /**
   * Preview template with sample data (static method)
   */
  static previewTemplate(template: string): string {
    const engine = new TemplateEngine(TemplateEngine.getSampleData());
    return engine.process(template);
  }

  /**
   * Generate sample data for preview
   */
  static getSampleData(): TemplateData {
    return {
      metycle: METYCLE_INFO,
      bl_extraction: {
        bl_number: "SAMPLE-BL-12345",
        bl_issue_date: new Date().toISOString().split("T")[0],
        vessel_name: "SAMPLE VESSEL",
        shipping_line: "Sample Shipping Line",
        shipper: "Sample Shipper Company\n123 Export Street\nExport City, Country",
        consignee_name: "Sample Consignee",
        consignee_address: "456 Import Avenue\nImport City, Country",
        consignee_contact_person_name: "John Doe",
        consignee_contact_person_email: "john@example.com",
        notify_name: "Sample Notify Party",
        notify_address: "789 Notify Road\nNotify City, Country",
        notify_contact_person_name: "Jane Smith",
        notify_contact_person_email: "jane@example.com",
        description_of_goods: "Aluminium Scrap",
        product_description: "HMS 1&2 80/20",
        hs_code: "7602.00.00",
        country_of_origin: "Germany",
        port_of_loading: "Hamburg, Germany",
        port_of_discharge: "Shanghai, China",
        final_destination: "Shanghai, China",
        number_of_packages: 20,
        number_of_containers: 2,
        applicable_free_days: 7,
        total_net_weight: 40000,
        total_gross_weight: 42000,
      },
      bl_order: {
        bl_order_name: "28878-1",
        status: "In Transit",
        loaded_quantity_mt: 40,
        total_quantity_mt: 40,
        loading_date: new Date().toISOString().split("T")[0],
        etd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        eta: new Date(Date.now() + 37 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        buy_final_price: 450,
        sell_final_price: 520,
        revenue: 2800,
        cost: 18000,
      },
      order: {
        id: "ORD-2024-001",
        buyer: "Sample Buyer Company",
        seller: "Sample Seller Company",
        commodity_type: "Aluminium",
        isri_grade: "Tense",
        metal_form: "Baled",
        product_details: "Aluminium extrusions, clean",
        allocated_quantity_mt: 40,
        buy_price: 450,
        sell_price: 520,
        margin: 15.56,
        ship_from: "Hamburg, Germany",
        ship_to: "Shanghai, China",
        incoterms: "FOB",
        created_at: new Date().toISOString().split("T")[0],
        sales_order_sign_date: new Date().toISOString().split("T")[0],
      },
      company: {
        name: "Sample Company Ltd",
      },
      company_address: {
        line1: "123 Business Park",
        city: "Business City",
        country: "Sample Country",
        VAT_id: "VAT123456789",
        pan_number: "ABCDE1234F",
        iec_code: "IEC0123456",
        contact_name_1: "Contact Person",
        email_1: "contact@sample.com",
        phone_1: "+1234567890",
      },
      ticket: {
        payment_terms: "100% CAD",
        payment_trigger_event: "ETA",
        payment_offset_days: -7,
        product_details: "Aluminium extrusions, clean, min 95% purity",
        currency: "USD",
        transport_method: "Sea",
        country_of_origin: "Germany",
        incoterms: "FOB",
        basis: "3M LLME",
        payable_percent: 0.57,
      },
      containers: [
        {
          container_number: "CONT123456",
          seal_number: "SEAL789012",
          net_weight: 20000,
          gross_weight: 21000,
        },
        {
          container_number: "CONT654321",
          seal_number: "SEAL210987",
          net_weight: 20000,
          gross_weight: 21000,
        },
      ],
    };
  }
}
