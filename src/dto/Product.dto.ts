export interface CreateProductInput {
    name: string;
    description: string;
    price: number;
    category: string;
    color: string;
    size: string;
    imagePath: string;
  }

  export interface EditProduct {
    name: string;
    description: string;
    price: number;
    category: string;
    color: string;
    size: string;
    imagePath: string;
  }